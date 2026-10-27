# Privacy policy

Last updated: 27 October 2026.

ARC Event Tracker is an unofficial community application maintained by
[maleoipTu](https://github.com/maleoipTu). The application has no developer-operated
analytics endpoint, advertising SDK or telemetry backend.

## Automatic network requests

Starting the application requests the current map-condition schedule directly
from **arcraiders.com**. While the application is open, it refreshes every
15 minutes and may refresh after connectivity returns. These requests do not
include the user's Steam or ARC Tracker credentials.

When update checks are enabled, the application contacts **GitHub** to check
release metadata. Windows may download an available update automatically and
install it when the application exits. Android checks for APK releases and opens
a download in the browser only when the user chooses it; Android confirms installation.
Update checks can be disabled in the application's Help settings.

Opening quest details may load illustrative images from **cdn.arctracker.io**.
The quest catalog is bundled with the application; quest completion flags are
not uploaded. Like ordinary HTTPS requests, these requests expose the device's
public IP address and normal connection/request metadata to the destination.

## Optional Windows connections

Steam authentication is opened on **steamcommunity.com**. Steam sends an OpenID
response to a temporary HTTP callback listener bound to **127.0.0.1** on the
user's own computer. The application verifies the response with Steam, obtains
the SteamID and may request a public profile. The app does not collect Steam passwords.

If a user saves a Steam Web API key and connects a Steam account, the app sends
that key and SteamID directly to **api.steampowered.com** to request profile data,
playtime and achievements. If ARC Tracker App/User keys are supplied, the app
sends them directly to **arctracker.io** to request the user's profile and recent raids.
These integrations are optional. The Android edition has no player-statistics
section, Steam login or API-key entry.

The app may display avatar images hosted by Steam's image services when a Steam
profile is connected. Help/source links open their labelled third-party website
in the user's browser when selected.

## Local data and system integration

The app stores schedule cache, selected region, event favorites and quest
progress in its local application storage. Windows also stores an optional
Steam profile/SteamID and app settings. Saved API keys are encrypted with
Electron safeStorage using the Windows platform's credential protection and
remain in the Windows user profile. Android does not store those API keys.

Windows startup/tray behavior and notifications are controlled in Help settings.
Android reminders require the system notification permission and are scheduled
locally for the next day of downloaded events. Notification titles and locations
may be visible on the lock screen according to the user's system settings.

There is no automatic account, favorites or quest-progress transfer between
Windows and Android. Clearing application data removes locally stored progress.
Steam can be disconnected in the Windows app. To revoke API access, revoke the
keys at the respective provider; clearing/uninstalling the app alone does not revoke them.
Windows app data may remain in the user profile after uninstalling.

## External providers

The maintainer does not operate Steam, Embark, ARC Tracker or GitHub and does not
control their server logs or retention. Their policies apply when using them:

- [Embark privacy policy](https://www.embark-studios.com/privacy-policy)
- [Steam privacy policy](https://store.steampowered.com/privacy_agreement/)
- [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- [ARC Tracker](https://arctracker.io/) — consult the current privacy/terms links
  on the service before connecting an account or generating keys.

For privacy questions, use the maintainer's public GitHub profile. Do not post
API keys, passwords, private raid data or unredacted diagnostic logs in public issues.
