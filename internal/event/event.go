package event

import (
	"sort"
	"time"
)

// Event represents something detected by a trigger.
type Event struct {
	ID        string            // unique key for dedup (e.g. "gitlab-issue-123")
	Type      string            // "gitlab-issue", "gitlab-ci"
	Trigger   string            // trigger name from config
	Pipeline  string            // which pipeline to run
	Priority  int               // lower = higher priority
	Data      map[string]string // template variables (jira_id, issue_iid, etc.)
	Timestamp time.Time
}

// SortByPriority sorts events: lower priority number first.
func SortByPriority(events []Event) {
	sort.Slice(events, func(i, j int) bool {
		if events[i].Priority != events[j].Priority {
			return events[i].Priority < events[j].Priority
		}
		return events[i].Timestamp.Before(events[j].Timestamp)
	})
}
