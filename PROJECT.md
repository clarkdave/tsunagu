# Tsunagu

The purpose of this project is to fetch transactions from various Japanese financial sources and push them into Pocketsmith.

## Implementation plan

- We'll use NodeJS, strict TypeScript, and Electron to build a desktop app
- We'll use a local sqlite database to store transaction data and ensure we don't push duplicates into Pocketsmith, i.e. we'll track which transactions have already been pushed successfully into Pocketsmith
  - this database should be saved in iCloud so it's automatically backed up
- We'll use the Pocketsmith API to push transactions into Pocketsmith
- No passwords will be stored: syncs will be triggered via user action in the UI,
  and when a password is needed, it'll prompt the user to enter it, and it won't be stored

## UI

We will use Electron's built-in UI framework to build a desktop app.

We're looking for a modern, clean and minimalist UI. Left and right panel interface

- A left-side sidebar that has a list of financial sources (empty by default),
  and underneath them a button to add a new source
  - each source shows its name, last updated time, last known balance
- clicking to add a source opens in the right panel:
  - choose the type of source
  - then, depending on what source is selected, additional details (e.g. username - NOT password)
- clicking on an existing source will show in the right panel:
  - a button to kick off a new sync
  - a button to open its settings page
  - a list of transactions
    - each transaction shows the date, amount, and description and indicates if
      it has been pushed to Pocketsmith
- at the bottom of the left sidebar there should be a settings button which
  opens the settings page
  - the settings page should have
    - a place to enter the Pocketsmith API key (not shown after it's set)
    - a place to specify the app home path, which is where the sqlite database
      will be stored, and where other folders can be created as needed

## Pocketsmith API

https://developers.pocketsmith.com/reference

The app must be able to run in "dry run" mode, where it shows or logs the Pocketsmith API
calls it would make, so we can sanity check everything before we actually push the transactions to Pocketsmith. Note that this dry run mode should not update the sqlite
database to indicate that the transactions have been pushed successfully, since they haven't.

## Financial sources

### American Express Japan

https://www.americanexpress.com/ja-jp/account

This should be fairly straightforward: can access online via username and password.

### JP Post Bank

https://www.jp-bank.japanpost.jp/index.html

Also fairly straightforward: can access online via a customer number and password.

### SBI Shinsei Bank

https://www.sbishinseibank.co.jp

This should also be fairly straightforward: can access online via username and password.

It _might_ require some kind of two-factor authentication, but it's not required on
every login and might only be needed after a certain period of time.

### PayPay

https://paypay.ne.jp/

This one is more difficult because there is no online interface for PayPay.

An approach I think will work is as follows:

- I manually export PayPay transactions from the app to a directory in iCloud
- Our app will scan that directory and consume all exports it finds, placing
  them into the sqlite database and pushing to Pocketsmith
