package state

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"
)

type State struct {
	Locks     map[string]LockEntry `json:"locks"`
	CISeen    map[string]string    `json:"ci_seen"`
	PollCount int                  `json:"poll_count"`
	StartedAt string               `json:"started_at"`

	mu   sync.Mutex
	path string
}

type LockEntry struct {
	Pipeline  string `json:"pipeline"`
	StartedAt string `json:"started_at"`
}

func NewState(path string) *State {
	s := &State{
		Locks:     make(map[string]LockEntry),
		CISeen:    make(map[string]string),
		StartedAt: time.Now().Format(time.RFC3339),
		path:      path,
	}
	s.load()
	return s
}

func (s *State) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return // file doesn't exist yet, start fresh
	}
	// load into temp to preserve mutex
	var loaded State
	if err := json.Unmarshal(data, &loaded); err != nil {
		return
	}
	s.Locks = loaded.Locks
	s.CISeen = loaded.CISeen
	s.PollCount = loaded.PollCount
	s.StartedAt = loaded.StartedAt

	if s.Locks == nil {
		s.Locks = make(map[string]LockEntry)
	}
	if s.CISeen == nil {
		s.CISeen = make(map[string]string)
	}
}

func (s *State) save() error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}
	return os.WriteFile(s.path, data, 0644)
}

func (s *State) IsLocked(eventID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.Locks[eventID]
	return ok
}

func (s *State) Lock(eventID, pipeline string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Locks[eventID] = LockEntry{
		Pipeline:  pipeline,
		StartedAt: time.Now().Format(time.RFC3339),
	}
	return s.save()
}

func (s *State) Unlock(eventID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.Locks, eventID)
	return s.save()
}

func (s *State) IsCISeen(pipelineID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.CISeen[pipelineID]
	return ok
}

func (s *State) MarkCISeen(pipelineID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.CISeen[pipelineID] = time.Now().Format(time.RFC3339)
	return s.save()
}

func (s *State) BumpPollCount() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.PollCount++
	return s.save()
}

func (s *State) CleanStaleLocks() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	// On startup, all locks are stale (process was restarted)
	s.Locks = make(map[string]LockEntry)
	return s.save()
}

func (s *State) ActiveCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.Locks)
}
