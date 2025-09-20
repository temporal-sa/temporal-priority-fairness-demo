package temporalpriorityfairnessdemo

import (
	"fmt"
	"time"
)

type ActivityData struct {
	StepNumber     int      `json:"stepNumber"`
	FairnessKey    string   `json:"fairnessKey"`
	FairnessWeight float32  `json:"fairnessWeight"`
	Priority       int      `json:"priority"`
	Results        []string `json:"results"`
}

func RunActivity(data ActivityData) (ActivityData, error) {
	pause(300)

	data.Results = append(data.Results, fmt.Sprintf(" %v - Activity step [%d] completed", time.Now(), data.StepNumber))

	return data, nil
}

func pause(duration time.Duration) {
	if duration < 1 {
		duration = 200
	}

	time.Sleep(duration * time.Millisecond)
}
