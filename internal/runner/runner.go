package runner

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/pavelpantiukhov/agent-orchestra/internal/config"
)

type Result struct {
	ExitCode int
	Duration time.Duration
	Err      error
	Output   string // captured stdout (only when CaptureOutput=true)
}

// Run executes an agent command with resolved defaults applied.
func Run(ctx context.Context, agent config.StepConfig, defaults config.DefaultsConfig, logger *slog.Logger) Result {
	start := time.Now()

	command, args := agent.ResolvedCommand(defaults)
	timeout := agent.ResolvedTimeout(defaults)
	env := agent.ResolvedEnv(defaults)
	workingDir := agent.ResolvedWorkingDir(defaults)

	// Apply timeout if configured
	if timeout != "" {
		d := config.ParseDuration(timeout, 0)
		if d > 0 {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, d)
			defer cancel()
		}
	}

	cmd := exec.CommandContext(ctx, command, args...)

	if workingDir != "" {
		cmd.Dir = workingDir
	}

	// Inherit parent environment and add agent-specific vars
	if len(env) > 0 {
		cmd.Env = os.Environ()
		for k, v := range env {
			cmd.Env = append(cmd.Env, k+"="+v)
		}
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return Result{ExitCode: -1, Duration: time.Since(start), Err: fmt.Errorf("stdout pipe: %w", err)}
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return Result{ExitCode: -1, Duration: time.Since(start), Err: fmt.Errorf("stderr pipe: %w", err)}
	}

	if err := cmd.Start(); err != nil {
		return Result{ExitCode: -1, Duration: time.Since(start), Err: fmt.Errorf("start: %w", err)}
	}

	var outputBuf strings.Builder

	done := make(chan struct{})
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			logger.Info(line, "agent", agent.Name, "stream", "stdout")
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
			logger.Warn(scanner.Text(), "agent", agent.Name, "stream", "stderr")
		}
		done <- struct{}{}
	}()

	<-done
	<-done

	err = cmd.Wait()
	duration := time.Since(start)

	result := Result{Duration: duration}
	if agent.CaptureOutput {
		result.Output = outputBuf.String()
	}

	if err != nil {
		exitCode := -1
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}

		result.ExitCode = exitCode

		if ctx.Err() == context.DeadlineExceeded {
			result.Err = fmt.Errorf("timeout after %s", timeout)
			return result
		}
		if ctx.Err() == context.Canceled {
			result.Err = context.Canceled
			return result
		}

		result.Err = fmt.Errorf("exit code %d: %w", exitCode, err)
		return result
	}

	return result
}
