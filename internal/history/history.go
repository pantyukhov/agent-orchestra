package history

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// RunRecord represents a single pipeline execution.
type RunRecord struct {
	ID        string            `json:"id"`                  // unique run ID (YYYYMMDD-HHMMSS)
	Pipeline  string            `json:"pipeline"`            // pipeline name
	Config    string            `json:"config"`              // config file path
	Status    string            `json:"status"`              // running, success, failure, canceled
	StartedAt string            `json:"started_at"`          // RFC3339
	EndedAt   string            `json:"ended_at,omitempty"`  // RFC3339
	Duration  string            `json:"duration,omitempty"`  // human-readable
	Error     string            `json:"error,omitempty"`     // error message if failed
	Steps     []StepRecord      `json:"steps"`               // per-step results
	SSH       *SSHInfo          `json:"ssh,omitempty"`       // SSH connection info
	Tmux      *TmuxInfo         `json:"tmux,omitempty"`      // tmux session info
	Meta      map[string]string `json:"meta,omitempty"`      // arbitrary metadata (event ID, issue, etc.)
}

// StepRecord represents a single step execution within a run.
type StepRecord struct {
	Name     string `json:"name"`
	Status   string `json:"status"`              // success, failure, skipped
	Duration string `json:"duration,omitempty"`
	ExitCode int    `json:"exit_code"`
	Error    string `json:"error,omitempty"`
	Output   string `json:"output,omitempty"`    // captured output (truncated)
}

// SSHInfo records SSH connection details for the run.
type SSHInfo struct {
	Host string `json:"host"`
	User string `json:"user"`
	Port int    `json:"port"`
}

// TmuxInfo records tmux session details for reconnection.
type TmuxInfo struct {
	Session string `json:"session"`            // full session name (with timestamp)
	LogFile string `json:"log_file"`           // remote log file path
	TTL     string `json:"ttl"`                // session TTL
	Attach  string `json:"attach"`             // command to reattach
}

// Store manages run history on disk.
type Store struct {
	dir string
}

// NewStore creates a history store at the given directory.
func NewStore(dir string) *Store {
	return &Store{dir: dir}
}

// Start creates a new run record and persists it.
func (s *Store) Start(pipeline, configPath string) (*RunRecord, error) {
	if err := os.MkdirAll(s.dir, 0755); err != nil {
		return nil, fmt.Errorf("create history dir: %w", err)
	}

	now := time.Now()
	r := &RunRecord{
		ID:        now.Format("20060102-150405"),
		Pipeline:  pipeline,
		Config:    configPath,
		Status:    "running",
		StartedAt: now.Format(time.RFC3339),
	}

	if err := s.save(r); err != nil {
		return nil, err
	}
	return r, nil
}

// Finish updates a run record with the final status.
func (s *Store) Finish(r *RunRecord, err error) error {
	now := time.Now()
	r.EndedAt = now.Format(time.RFC3339)

	start, _ := time.Parse(time.RFC3339, r.StartedAt)
	r.Duration = now.Sub(start).Round(time.Second).String()

	if err != nil {
		r.Status = "failure"
		r.Error = err.Error()
	} else {
		r.Status = "success"
	}

	return s.save(r)
}

// Cancel marks a run as canceled.
func (s *Store) Cancel(r *RunRecord) error {
	now := time.Now()
	r.EndedAt = now.Format(time.RFC3339)
	r.Status = "canceled"

	start, _ := time.Parse(time.RFC3339, r.StartedAt)
	r.Duration = now.Sub(start).Round(time.Second).String()

	return s.save(r)
}

// AddStep appends a step result to the run record and persists it.
func (s *Store) AddStep(r *RunRecord, step StepRecord) error {
	r.Steps = append(r.Steps, step)
	return s.save(r)
}

// List returns all run records, sorted by most recent first.
func (s *Store) List() ([]RunRecord, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var runs []RunRecord
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.dir, e.Name()))
		if err != nil {
			continue
		}
		var r RunRecord
		if err := json.Unmarshal(data, &r); err != nil {
			continue
		}
		runs = append(runs, r)
	}

	sort.Slice(runs, func(i, j int) bool {
		return runs[i].StartedAt > runs[j].StartedAt
	})

	return runs, nil
}

// Get returns a single run record by ID.
func (s *Store) Get(id string) (*RunRecord, error) {
	data, err := os.ReadFile(filepath.Join(s.dir, id+".json"))
	if err != nil {
		return nil, err
	}
	var r RunRecord
	if err := json.Unmarshal(data, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *Store) save(r *RunRecord) error {
	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal run record: %w", err)
	}
	path := filepath.Join(s.dir, r.ID+".json")
	return os.WriteFile(path, data, 0644)
}
