# Why this park

## The park and the engagement

Jonathan Rogers Park is a 1.4 ha neighbourhood park in Mount Pleasant, Vancouver. The Vancouver Park Board plans to improve it, and the work covers the eastern half of the park. The facts below are from the Park Board's project page at https://www.shapeyourcity.ca/jonathan-rogers-park, read on 2026-10-03. CommonGround is not part of that engagement. It is a demonstration that uses the same park and public data.

- The Park Board is looking at a renewed playground for children of all ages and abilities. It is also looking at a fenced off-leash area for dogs and better access across the site.
- The community garden and the open space, including the ball diamond, stay.
- The survey ran from April 14 to May 3, 2026 and got 815 responses. A pop-up in the park on April 18, 2026 had over 100 visitors.
- A refined concept plan goes to the public and then to the Park Board in late 2026 or early 2027.

The recorded site in this repo has 22 public trees, 12 of them over 30 cm across the trunk, and a community garden with 56 plots. The ground falls about 5 m from south to north, and 9 m from the south-east corner to the north-west corner. The grid is 176 by 86 m.

We chose this park because the scope is real and small. The rules that decide a design here are budget, garden plots, accessible path grades and tree protection, and all of them fit on one screen.

## The representativeness problem

The 815 people who answered the survey chose to answer it. Planners can see how many people answered. They can't easily see who did not, such as a parent with no spare evening or someone who reads English as a second language. A ranked list of amenities also hides the tradeoffs. Someone can tick "playground", "dog area" and "more trees" without seeing that they compete for the same half of a 1.4 ha park.

CommonGround changes what a response is. Each resident submits a whole design that fits the budget and the site, and the server checks it against the same rules the planners use. Other residents then vote on those designs from a phone, and give a reason for each vote. The insights page shows who took part by postal area and age band, so planners can see which groups are missing while the engagement is still open. Design and voting open and close together on one closing day, and planners review the results after that day. Groups under 5 people are hidden, so no one can be picked out.

## What planners get

- Designs that already meet the budget, the garden plot minimum and the zones they set. The server rejects any that do not.
- Heatmaps of where residents put paths, trees, seating, play, gardens, dog areas and regrading. Desire lines show along every path.
- A leaderboard ranked with a Bayesian average, so a design with 3 votes does not beat one with 40 on luck.
- Exports of the top 10 designs as CSV, GeoJSON and DXF for their own tools.
- A generated summary of the themes and tradeoffs in the top 10 designs. The page labels it as generated.

## What residents get

- The real terrain in 3D, with meters for budget, tree canopy and path grade that update as they work.
- Describe it, which turns a sentence such as "shade near the garden and a loop path" into a layout they can edit.
- Up to 3 live designs each, and a place on the leaderboard that other residents can see.
- A vote on a phone, with the reasons they choose.

## The numbers on the insights page

| Section                        | What it counts                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Headline numbers               | Designs submitted, unique voters and votes cast                                                |
| What designs include           | For each feature, the share of designs that add at least 1, and the average number per design  |
| Why people voted               | How many votes named each reason, in all and for each design                                   |
| Park rules                     | For each of the 9 rules, how many designs met it, missed it or failed it                       |
| Soil moved                     | Designs grouped by net soil in steps of 50 m³                                                  |
| Changes to what is there today | The share of designs that moved a feature more than 1 m, removed it, or resized it by over 10% |
| Where designs put things       | 8 heatmap layers on a 1 m grid, draped on the terrain                                          |
| Who took part                  | People by postal area and by age band, with groups under 5 hidden                              |
