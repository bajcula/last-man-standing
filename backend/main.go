package main

import (
	"log"
	"os"
	"strings"

	"github.com/bajcula/last-man-standing/backend/hooks"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "github.com/bajcula/last-man-standing/backend/migrations"
)

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	hooks.RegisterGameweekCron(app)

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.GET("/api/health", func(e *core.RequestEvent) error {
			return e.JSON(200, map[string]string{"status": "ok"})
		})
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
