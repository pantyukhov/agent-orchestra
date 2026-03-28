package trigger

import (
	"context"

	"github.com/pavelpantiukhov/agent-orchestra/internal/event"
)

// Trigger polls an external system and returns new events.
type Trigger interface {
	Name() string
	Poll(ctx context.Context) ([]event.Event, error)
}
