# ScheduleDis

![ScheduleDis: schedule a whole run of Discord messages in one go](docs/images/hero.png)

Discord lets you schedule messages one at a time. ScheduleDis lets you set up a whole run at once: pick a message, how many times to send it, and how far apart. It's handy for reminders, repeating posts and commands for bots with a cooldown.

**[⬇ Download ScheduleDis](../../releases/latest/download/ScheduleDis.zip)**

Works in Chrome, Edge, Brave and similar browsers, using Discord in the browser (not the desktop app). Your account needs Discord's scheduled messages feature.

## Install

1. Download the zip above and unzip it. Keep the `ScheduleDis` folder somewhere you won't delete it, because your browser keeps using it.
2. Type `chrome://extensions` in your address bar and press Enter.
3. Turn on **Developer mode** (top right), then click **Load unpacked** and choose the `ScheduleDis` folder.

![The extensions page, with Developer mode and Load unpacked highlighted](docs/images/install.png)

To keep it handy, click the puzzle piece icon in your toolbar and pin ScheduleDis.

## How to use it

Open [Discord](https://discord.com/app) in your browser, go to the channel or DM you want, then click the ScheduleDis icon.

![The Schedule tab with four numbered steps](docs/images/steps.png)

1. **How many:** drag the slider to choose how many messages to schedule.
2. **Every:** set the time between messages. Turn on **Buffer** to add a few extra seconds to each gap, which helps if a bot's cooldown is strict.
3. **First message sends:** choose a wait or a set time. Discord needs at least about 11 minutes' notice and allows up to 8 days ahead. Click **Preview times** to check every send time.
4. **Send:** type your message and press the send button.

Keep the Discord tab open until scheduling finishes. You can close the popup. Discord allows about 10 new scheduled messages at once, then roughly one every 3 minutes, so bigger runs take a while. Once they're scheduled, Discord sends them for you.

### Queued and Presets

![The Queued and Presets tabs](docs/images/tabs.png)

- **Queued** shows everything you have scheduled, including messages you scheduled in Discord itself. Click ✕ to cancel one, or hold the red button to cancel them all.
- **Presets** keeps setups you use often. Press the ☆ next to your message to save one, then click it later to fill everything back in.

## Good to know

- **Slots:** Discord limits how many messages you can have scheduled at once. It's 10 without Nitro and more with it. The number you have is shown at the top right.
- **Text only:** ScheduleDis can't schedule images or files.
- **Updating:** download the new zip, replace the contents of your `ScheduleDis` folder, then click the reload icon on ScheduleDis in `chrome://extensions`.

## If something's not working

| What you see | What to do |
| --- | --- |
| "Discord isn't open" | Open Discord in a browser tab. The desktop app doesn't count. |
| "Scheduled messages aren't on for this account" | Discord is rolling this feature out gradually, so your account doesn't have it yet. |
| "Discord changed something this extension relies on" | A Discord update broke something. Check here for a newer version. |

## Privacy and risk

ScheduleDis runs only on Discord's site, in your own browser. It never sees your password or login token, and it doesn't send your data anywhere except Discord. Your settings and presets stay in your browser.

ScheduleDis is an unofficial tool, and it isn't made by or affiliated with Discord. Discord's rules restrict automating user accounts, so **use it at your own risk**.
