# Demo script

This is the 3-minute demo of CommonGround on Jonathan Rogers Park. Run the demo from your laptop first. Keep the deployed URL open in a second browser as the backup.

## Setup checklist

Do these 30 minutes before the demo.

1. On the laptop, run `pnpm install`. Run `ipconfig getifaddr en0` to get the laptop's Wi-Fi address, shown here as `<ip>`.
2. In the first terminal, export these variables and start the seeding API. It wipes `.data/parkshape`, seeds 30 designs, 350 votes and 30 thumbnails, then serves the API on port 8787 of every address. It takes 2 to 3 minutes and is ready when it prints `seeded api listening on http://localhost:8787`:

   ```sh
   export VITE_API_URL=http://<ip>:8787 CORS_ORIGIN=http://<ip>:5174 AUTH_COOKIE_SECURE=off
   export DATABASE_URL=pglite://$PWD/.data/parkshape PARKSHAPE_OFFLINE=1 VITE_MAP_TILES=static
   pnpm --filter @parkshape/seed-tool serve
   ```

   The phone can't use `localhost`, so the browser calls the API at the laptop address. `AUTH_COOKIE_SECURE=off` is needed because the stack is plain `http`, and a browser drops a `Secure` session cookie from a Wi-Fi address.

3. In a second terminal, with the same variables exported, build the web app and serve it on the Wi-Fi: `pnpm --filter @parkshape/web build`, then `pnpm --filter @parkshape/web exec vite preview --host --port 5174`. Use this build, not the Vite dev server. The dev server shows no meters in the editor.
4. Open `http://<ip>:5174` on the laptop and check that the landing page shows "30 designs, 350 votes, closes 31 October". Use this address on the laptop for the whole demo, so the laptop and phone share one API.
5. Staff can't open resident pages, so the laptop needs 2 browser profiles. In the first, open `http://<ip>:5174/login`, log in as Molly Swingset and click Skip on About you. In the second, open `http://<ip>:5174/staff/login` and log in as Paula Blueprint.
6. Put the phone on the same Wi-Fi, open `http://<ip>:5174/login`, log in as Bob Walksadog and click Skip on About you.
7. Get the project ID from `curl -s http://<ip>:8787/projects`. In the Molly Swingset profile, open 2 tabs, left to right: the landing page, then `http://<ip>:5174/projects/<project-id>/leaderboard`. In the Paula Blueprint profile, click Insights for Jonathan Rogers Park.
8. Nothing is deployed from this repo yet, so there is no backup URL. When a deployed copy exists, open it in a third browser and log in there too. Use it only if the laptop fails.
9. Turn off notifications and set the laptop display to mirror.

`pnpm dev:local` also starts a seeded stack. It keeps the thumbnails in `.data/blobs`, so vote cards show them. Preflight runs by hand, with `pnpm preflight`, and in CI.

## Script

Each beat has a start time. The whole script runs 3 minutes.

| Start | Beat              | What you do                                                                                                                                                                                                                                                    | What you say                                                                                                                   |
| ----- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0:00  | Landing           | Show the landing page. Click Design a park, then Jonathan Rogers Park.                                                                                                                                                                                         | "The Park Board is planning changes to the east half of Jonathan Rogers Park. In this demo, residents draw their own version." |
| 0:15  | Describe it       | Click Start a design, then Describe your park in words. Type "shady play area near the garden, a loop path, a dog run" and click Make my layout. Click Open in editor.                                                                                         | "You describe the park you want in your own words. The app turns it into a layout you can edit."                               |
| 0:35  | Editor and meters | Place a Bigleaf maple from the palette. Choose Path, click 3 points on the ground and press Enter. Point at Budget and Tree canopy at maturity under Design targets.                                                                                           | "The meters update as you edit. The Path slopes meter checks that every path is 5% grade or less."                             |
| 0:55  | Map layers        | Click Map layers beside the view presets. Turn on Bike routes and Parking, then press Escape. Point at the bus stop pins and the street names. Choose Path and end a path near the W 7th Ave sidewalk to show the snap ring.                                   | "The streets, bus stops and parking around the park are real city data. A path end near a sidewalk snaps to the park edge."    |
| 1:10  | Terraform         | Click Terraform, then Lower. Hold the mouse on the ground next to the path for 1 second. Show Cut under Earthworks and the Budget meter going up.                                                                                                              | "You can move soil. The app counts the cubic metres and adds the cost to the budget."                                          |
| 1:25  | Submit            | Click Submit design, then Submit design in the dialog. Show the badges the server returns, such as "Over budget 11%" or "2 steep spots".                                                                                                                       | "The server checks the budget, the garden plots and the zones again. A design that breaks a rule can't go in."                 |
| 1:35  | Vote on the phone | Hold up the phone and tap Vote up on 2 designs. After each vote, tap a reason, then Next design. Point at the laptop leaderboard.                                                                                                                              | "Anyone can vote from a phone. Watch the leaderboard on the laptop reorder within 5 seconds."                                  |
| 1:55  | Review and walk   | On the laptop, open Cedar shade walk and click Review this design. Tap the bench, choose Move, type "This bench should face the playground" and click Add comment. Point at the chip. Click Walk the park, hold the up arrow for 2 seconds, then press Escape. | "Residents comment on one bench or one path, not the whole design. Walk the park shows the design at eye height."              |
| 2:20  | Insights          | Switch to the Paula Blueprint profile. Show the headline numbers, then click Paths and Play under Where designs put things.                                                                                                                                    | "Planners see where residents put things. Darker blue means more designs put a path or play area there."                       |
| 2:40  | Generated summary | Scroll to Generated summary on the insights page. It lists what the top designs share and where they split, and says fixed rules wrote it.                                                                                                                     | "A summary lists the themes and tradeoffs across the top 10 designs. It is labelled as generated."                             |
| 2:55  | Close             | Go back to the landing page in the Molly Swingset profile.                                                                                                                                                                                                     | "Jonathan Rogers Park, 1.4 ha, real terrain, and every design measured the same way."                                          |

The editor measures on a flat grid of the parcel for now, so a path you draw reads 0% grade. Lowering the ground next to it makes the grade go up, not down.

## Local first, deployed as backup

Run the demo on the seeding API and the preview build. They need no network, so venue Wi-Fi can't break them. The phone beat is the only one that needs a network, and it needs only the local Wi-Fi between phone and laptop.

A deployed app on Vercel would be the backup once it exists. Use it when the laptop build fails or the phone can't reach the laptop. The deployed data is separate from the local data, so seed it or submit 3 designs there during setup.

## When something fails

| What fails                               | What you do                                                                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The API or web server does not start     | Check that nothing else holds the port with `lsof -iTCP:8787 -sTCP:LISTEN` and `lsof -iTCP:5174 -sTCP:LISTEN`. If a deployed copy exists, switch to it and carry on from the same beat.                           |
| The API stops during the demo            | Pages show "This page did not load" and the leaderboard keeps its last counts. In the first terminal run `pnpm --filter @parkshape/api dev`. It is back in 5 seconds with the votes kept, but with no thumbnails. |
| The phone can't reach the laptop         | Vote on the phone through the deployed URL if there is one, and show the deployed leaderboard on the laptop.                                                                                                      |
| The 3D editor is slow or blank           | Skip to Submit with a design you saved during setup. Say the editor needs WebGL.                                                                                                                                  |
| Describe it returns a layout you dislike | Keep it. Say it is a starting point, then fix one thing by hand in the editor beat.                                                                                                                               |
| The leaderboard does not reorder         | Reload the tab. A tab in the background does not poll, and a visible tab polls every 5 seconds, so 1 reload is enough.                                                                                            |
| Insights shows no heatmap                | Check that at least 3 designs are submitted. The heatmap needs submitted designs.                                                                                                                                 |
| The summary section is missing           | Say that the summary is off in this build and move to the close. The API needs `FEATURE_SUMMARY=true`, which is the default.                                                                                      |

Don't rerun the seeding API during the demo. It wipes the database and takes 2 to 3 minutes.
