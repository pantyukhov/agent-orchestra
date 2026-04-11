package runner

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"net"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
)

// runSSH executes a command on a remote host via SSH.
func runSSH(ctx context.Context, agent config.StepConfig, defaults config.DefaultsConfig, logger *slog.Logger) Result {
	start := time.Now()

	sshCfg := agent.ResolvedSSH(defaults)
	command, args := agent.ResolvedCommand(defaults)
	env := agent.ResolvedEnv(defaults)
	workingDir := agent.ResolvedWorkingDir(defaults)

	// Build the remote command string
	var remoteCmd string
	if sshCfg.Tmux != nil {
		remoteCmd = buildTmuxCommand(command, args, env, workingDir, sshCfg.Tmux, agent.Name)
	} else {
		remoteCmd = buildRemoteCommand(command, args, env, workingDir)
	}

	// Connect
	client, err := dialSSH(ctx, sshCfg)
	if err != nil {
		return Result{ExitCode: -1, Duration: time.Since(start), Err: fmt.Errorf("ssh connect: %w", err)}
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return Result{ExitCode: -1, Duration: time.Since(start), Err: fmt.Errorf("ssh session: %w", err)}
	}
	defer session.Close()

	stdout, err := session.StdoutPipe()
	if err != nil {
		return Result{ExitCode: -1, Duration: time.Since(start), Err: fmt.Errorf("ssh stdout pipe: %w", err)}
	}

	stderr, err := session.StderrPipe()
	if err != nil {
		return Result{ExitCode: -1, Duration: time.Since(start), Err: fmt.Errorf("ssh stderr pipe: %w", err)}
	}

	logger.Info("starting remote command", "host", sshCfg.Host, "command", remoteCmd)

	if err := session.Start(remoteCmd); err != nil {
		return Result{ExitCode: -1, Duration: time.Since(start), Err: fmt.Errorf("ssh start: %w", err)}
	}

	var outputBuf strings.Builder

	done := make(chan struct{}, 2)
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			logger.Info(line, "agent", agent.Name, "stream", "stdout", "host", sshCfg.Host)
			if agent.CaptureOutput {
				outputBuf.WriteString(line)
				outputBuf.WriteString("\n")
			}
		}
		done <- struct{}{}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			logger.Warn(scanner.Text(), "agent", agent.Name, "stream", "stderr", "host", sshCfg.Host)
		}
		done <- struct{}{}
	}()

	// Handle context cancellation (timeout / signal)
	waitDone := make(chan error, 1)
	go func() {
		waitDone <- session.Wait()
	}()

	var waitErr error
	select {
	case waitErr = <-waitDone:
		<-done
		<-done
	case <-ctx.Done():
		// Send signal to remote process
		_ = session.Signal(ssh.SIGINT)
		<-done
		<-done
		duration := time.Since(start)
		result := Result{ExitCode: -1, Duration: duration}
		if ctx.Err() == context.DeadlineExceeded {
			result.Err = fmt.Errorf("timeout")
		} else {
			result.Err = context.Canceled
		}
		if agent.CaptureOutput {
			result.Output = outputBuf.String()
		}
		return result
	}

	duration := time.Since(start)
	result := Result{Duration: duration}
	if agent.CaptureOutput {
		result.Output = outputBuf.String()
	}

	if waitErr != nil {
		exitCode := -1
		if exitErr, ok := waitErr.(*ssh.ExitError); ok {
			exitCode = exitErr.ExitStatus()
		}
		result.ExitCode = exitCode
		result.Err = fmt.Errorf("exit code %d: %w", exitCode, waitErr)
		return result
	}

	return result
}

func dialSSH(ctx context.Context, cfg *config.SSHConfig) (*ssh.Client, error) {
	authMethods, err := buildAuthMethods(cfg)
	if err != nil {
		return nil, err
	}

	hostKeyCallback := ssh.InsecureIgnoreHostKey()
	if cfg.KnownHosts != "" {
		hkCallback, err := knownhosts.New(cfg.KnownHosts)
		if err != nil {
			return nil, fmt.Errorf("known_hosts %s: %w", cfg.KnownHosts, err)
		}
		hostKeyCallback = hkCallback
	}

	port := cfg.Port
	if port == 0 {
		port = 22
	}

	clientCfg := &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            authMethods,
		HostKeyCallback: hostKeyCallback,
		Timeout:         30 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, port)

	// Dial with context support
	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", addr, err)
	}

	c, chans, reqs, err := ssh.NewClientConn(conn, addr, clientCfg)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("ssh handshake %s: %w", addr, err)
	}

	return ssh.NewClient(c, chans, reqs), nil
}

func buildAuthMethods(cfg *config.SSHConfig) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod

	// Key file auth
	if cfg.KeyFile != "" {
		key, err := os.ReadFile(cfg.KeyFile)
		if err != nil {
			return nil, fmt.Errorf("read key %s: %w", cfg.KeyFile, err)
		}
		signer, err := ssh.ParsePrivateKey(key)
		if err != nil {
			return nil, fmt.Errorf("parse key %s: %w", cfg.KeyFile, err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}

	// Try default key paths if no explicit key
	if cfg.KeyFile == "" && cfg.Password == "" && cfg.PassEnv == "" {
		home, _ := os.UserHomeDir()
		for _, name := range []string{"id_ed25519", "id_rsa"} {
			path := home + "/.ssh/" + name
			key, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			signer, err := ssh.ParsePrivateKey(key)
			if err != nil {
				continue
			}
			methods = append(methods, ssh.PublicKeys(signer))
			break
		}
	}

	// Password auth
	password := cfg.Password
	if cfg.PassEnv != "" {
		password = os.Getenv(cfg.PassEnv)
	}
	if password != "" {
		methods = append(methods, ssh.Password(password))
	}

	if len(methods) == 0 {
		return nil, fmt.Errorf("no SSH auth method configured (set key_file, password, or password_env)")
	}

	return methods, nil
}

// buildRemoteCommand constructs a shell command string for remote execution.
func buildRemoteCommand(command string, args []string, env map[string]string, workingDir string) string {
	var parts []string

	// Prepend env vars
	for k, v := range env {
		parts = append(parts, fmt.Sprintf("export %s=%s;", k, shellQuote(v)))
	}

	// cd to working dir
	if workingDir != "" {
		parts = append(parts, fmt.Sprintf("cd %s &&", shellQuote(workingDir)))
	}

	// Command + args
	parts = append(parts, shellQuote(command))
	for _, a := range args {
		parts = append(parts, shellQuote(a))
	}

	return strings.Join(parts, " ")
}

// buildTmuxCommand wraps a command in a unique tmux session on the remote host.
// Each invocation creates a new session with a timestamp suffix.
// A background TTL watchdog auto-kills the session after the configured duration (default 72h).
// If SSH disconnects, the tmux session keeps running. User can reattach with:
//
//	tmux attach -t <session>
func buildTmuxCommand(command string, args []string, env map[string]string, workingDir string, tmuxCfg *config.TmuxConfig, stepName string) string {
	baseName := tmuxCfg.Session
	if baseName == "" {
		baseName = stepName
	}
	if baseName == "" {
		baseName = "agent"
	}

	// Unique session per run: base-YYYYMMDD-HHMMSS
	session := fmt.Sprintf("%s-%s", baseName, time.Now().Format("20060102-150405"))

	logDir := tmuxCfg.LogDir
	if logDir == "" {
		logDir = "/tmp/agent-orchestra"
	}

	logFile := fmt.Sprintf("%s/%s.log", logDir, session)

	// TTL: auto-kill session after duration (default 72h)
	ttl := tmuxCfg.TTL
	if ttl == "" {
		ttl = "72h"
	}
	ttlSeconds := int64(config.ParseDuration(ttl, 72*time.Hour).Seconds())

	// Build the inner command (what runs inside tmux)
	innerCmd := buildRemoteCommand(command, args, env, workingDir)

	// The full remote command:
	// 1. Create log directory
	// 2. Start new tmux session with unique name
	// 3. Pipe tmux output to log file
	// 4. Spawn background TTL watchdog that kills session after expiry
	// 5. Tail the log file to stream output back through SSH
	return fmt.Sprintf(
		"mkdir -p %s; touch %s; "+
			"tmux new-session -d -s %s %s; "+
			"tmux pipe-pane -t %s -o 'cat >> %s'; "+
			"(sleep %d && tmux kill-session -t %s 2>/dev/null) &"+
			" tail -n +1 -f %s",
		shellQuote(logDir), shellQuote(logFile),
		shellQuote(session), shellQuote(innerCmd),
		shellQuote(session), shellQuote(logFile),
		ttlSeconds, shellQuote(session),
		shellQuote(logFile),
	)
}

func shellQuote(s string) string {
	if s == "" {
		return "''"
	}
	// If no special chars, return as-is
	safe := true
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.' || c == '/' || c == ':' || c == ',' || c == '=') {
			safe = false
			break
		}
	}
	if safe {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

