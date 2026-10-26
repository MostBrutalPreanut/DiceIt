# Player feedback

Players press `P` (anywhere but a text box), or the **P feedback** button on the main menu and the pause card, to
send feedback. The form asks for a name (remembered on the device), what it is about and the message. "About"
offers the parts of the game (scoring, the shop, bosses, a bug...), every part and decal on the player's machine,
and everything else they have found in their Library, so nobody has to remember a part's name. The game holds
still while the form is open.

Each message goes in as one row of a Google Sheet, with a snapshot of where the player was: the machine, round,
money, score and goal, the parts on the table and in the toolbox, the decals, the build (commit) and the screen size.

Code: `src/ui/feedback.ts` (form, outbox, sending), the hooks in `src/main.ts`, the inbox script in
`tools/feedback-sheet.gs`.

## The sheet

[BIG BOI Pinball Designer: player feedback](https://docs.google.com/spreadsheets/d/1po9cYsoQpXG3Id5O10IvczmvGkHoG4CgKcsHs7yqGyE/edit)
(columns: Received, Sent, Name, About, Feedback, Where, Machine, Round, Money, Score, Goal, Run score, Parts on
table, Toolbox, Decals, Version, Screen, ID).

## Turning it on (once, about two minutes)

A browser game cannot write to a sheet by itself, so a small Apps Script web app, attached to the sheet, does it.

1. Open the sheet, then **Extensions > Apps Script**.
2. Replace what is in `Code.gs` with the contents of `tools/feedback-sheet.gs` and save.
3. **Deploy > New deployment**, type **Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Deploy, and
   allow the permissions it asks for (it only touches this sheet).
4. Copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`). Opening it in a browser should show
   `{"ok":true,...}`.
5. Put it in `FEEDBACK_URL` at the top of `src/ui/feedback.ts`, and push. The next deploy sends feedback.

Until the address is set, messages wait on the player's device (up to 20) and go out with the first build that has
it. The same happens when a player is offline. A message the game sends twice is written once (by its ID).

After changing the script later, use **Deploy > Manage deployments > Edit > New version**, so the URL stays the
same.

## Reading it

Ask Claude to read the feedback sheet (through the Google Drive connector), sum up what players say, and propose
what to change. The sheet lives outside the repo, so the game code never holds anyone's messages.

The URL is public in the built game (anyone could post to it), which is the usual trade-off for a form like this.
The script only appends rows, caps every cell at 5,000 characters and keeps text that looks like a formula as text.
If spam ever shows up, deploy a new version under a new URL and replace `FEEDBACK_URL`.
