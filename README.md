# WallPanel

[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/integration)
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/g-j-h-1/lovelace-wallpanel-photo-selector?style=for-the-badge)](https://github.com/g-j-h-1/lovelace-wallpanel-photo-selector/releases)
[![GitHub stars](https://img.shields.io/github/stars/g-j-h-1/lovelace-wallpanel-photo-selector?color=yellow&style=for-the-badge)](https://github.com/g-j-h-1/lovelace-wallpanel-photo-selector/stargazers)
![GitHub All Releases](https://img.shields.io/github/downloads/g-j-h-1/lovelace-wallpanel-photo-selector/total.svg?color=green&style=for-the-badge)
[![Documentation](https://img.shields.io/badge/view-Documentation-blue?style=for-the-badge)](https://g-j-h-1.github.io/lovelace-wallpanel-photo-selector/ "Go to WallPanel documentation")


🖼️ **Wall panel mode for your Home Assistant Dashboards.**  

WallPanel is a configurable extension that features:

- Photo and video slideshow screensaver
- Show dashboard views, cards and badges of your choice on top of the images.
- Full-screen mode
- Hide the side and or top bar 
- Screen wake lock
- Motion detection

You can use images and videos from the following sources:

- Home Assistant Media-source
- Immich
- Home Assitant entities with entity_picture attribute
- Full websites as iframe
- Unsplash

![Screenshot of screensaver](./docs/screensaver-screenshot.png)

## Installation

* Search for `WallPanel` in the Home Assistant Community Store
* Click on the repository
* Click the `Download` button
* You can now select a special version if required
* Click on `Download`

## Quick Start
After [Installation](#installation) you can enable wallpanel for a dashboard.
To do this, add a wallpanel configuration to your Home Assistant dashboard configuration yaml (raw config).

* Navigate to the dashboard.
* Click Overview in your sidebar.
* Click the three dots menu (top-right) and click on Edit Dashboard.
* Click the three dots menu again and click on Raw configuration editor.
* Add the `wallpanel` configuration above anything else.

```yaml
wallpanel:
  enabled: true
  hide_toolbar: false
  hide_sidebar: true
  fullscreen: false
  idle_time: 10
```

After saving and closing the dashboard configuration, WallPanel should now be active for this dashboard.
The sidebar should be hidden and the screensaver should start after an idle time of 10 seconds.

## Photo Selector: orientation-aware cards

With the separate [WallPanel Photo Selector server integration](https://github.com/g-j-h-1/ha-wallpanel-photo-selector) installed, individual screensaver
cards can be shown only for particular photograph orientations. The orientation is
determined from the loaded image's actual dimensions when the image becomes active.

```yaml
wallpanel:
  enabled: true
  image_url: media-source://media_source/local/PortalPhotos
  media_order: random
  photo_selector_enabled: true
  photo_selector_history_size: 50
  cards:
    - type: custom:digital-clock
      timeFormat:
        hour: 2-digit
        minute: 2-digit
      dateFormat:
        weekday: long
        day: 2-digit
        month: long
    - type: entities
      show_on_orientation: landscape
      entities:
        - entity: sensor.vodafone
          name: Vodafone (GBp)
    - type: weather-forecast
      show_on_orientation: landscape
      entity: weather.forecast_home
      forecast_type: daily
```

Cards without `show_on_orientation` are always displayed. Supported values are
`portrait`, `landscape`, `square`, and `unknown`. To permit more than one
orientation, supply a list, for example `show_on_orientation: [landscape, square]`.
Hidden cards take up no layout space. Unknown dimensions match only `unknown`.

The effective history exclusion is automatically capped at 25% of the number of
eligible photographs on that dashboard (rounded down). Filename and rating
exclusions are applied before calculating this cap.

## Documentation
Further information can be found in the [WallPanel Documentation](https://j-a-n.github.io/lovelace-wallpanel/).

## Credits
Thanks to Unsplash and to all the photographers for sharing their great photos!
Many thanks to Openstreetmap for providing the excellent Nominatim search engine!
Thanks to Jacob Seidelin for exif-js!

This project is inspired by:
- https://github.com/tcarlsen/lovelace-screensaver
- https://gist.github.com/ciotlosm/1f09b330aa5bd5ea87b59f33609cc931
- https://github.com/richtr/NoSleep.js
- https://github.com/madeInLagny/mil-no-sleep

## Reviews / Tutorials
- [SmartHomeScene - WallPanel: Home Assistant Screensaver for your wall-mounted control panel](https://smarthomescene.com/guides/wallpanel-home-assistant-screensaver-for-your-wall-mounted-control-panel)
- [Smart Home Pursuites - Install Fully-Kiosk + Wallpanel in Home Assistant for Fire Tablets](https://smarthomepursuits.com/fire-tablet-fully-kiosk-screensaver-home-assistant/)

## Videos
- [YouTube: Next Level Tablet Dashboard 🌅 mit lovelace-wallpanel 🤩 (🇩🇪)](https://www.youtube.com/watch?v=_KTyYIznzMY)
- [YouTube: So wird dein Home Assistant Wallpanel zum Kunstobjekt! (🇩🇪)](https://youtu.be/ohBRmoOTKW0?si=S1Yl_Mmj7jXKLPpC)

### Filename segments in image information

To show a particular part of a filename, configure a literal separator and use a zero-based segment in the existing image information template:

```yaml
wallpanel:
  show_image_info: true
  image_info_filename_separator: "_"
  image_info_template: '${image.filename_parts.1}'
```

For `20261025_Rugby vs Leicester_IMG1234.jpg`, segment `0` is `20261025`, segment `1` is `Rugby vs Leicester`, and segment `2` is `IMG1234`. The filename extension is excluded before splitting. Change `image_info_filename_separator` to any literal separator, including multi-character separators such as `--`. The original `${image.filename}` remains available.

### Automatic and manual photo rescans

The [separate Home Assistant server integration](https://github.com/g-j-h-1/ha-wallpanel-photo-selector) scans the configured media directory on startup and automatically repeats scans at the configured `scan_interval` (minutes; default 15). The next scheduled scan is measured from the completion of the previous scan.

To rescan immediately, open **Settings → Devices & services → Devices → WallPanel Photo Selector** and press **Rescan photos**. You can also use the Home Assistant `button.press` action on the new `button.*_rescan_photos` entity in an automation. The **Scan status** and **Last scan** sensors show progress and completion. Automatic and manual scans are serialized to prevent overlapping work.

After installing a new integration release through HACS, restart Home Assistant to load the Python integration changes and register the new button.

## Person-aware slideshow (optional)

With Immich face metadata exported into `/media/PortalPhotos/immich-people.json`, the
Photo Selector can prefer photographs containing people recognised by the Portal Mini.
The JSON file maps paths relative to `/media/PortalPhotos` to arrays of names:

```json
{
  "example.jpg": ["Person A", "Person B"]
}
```

Enable the feature on the Portal dashboard:

```yaml
wallpanel:
  photo_selector_enabled: true
  media_order: random
  photo_selector_person_entity: input_text.portal_recognised_people
```

To show optional on-screen person-selection diagnostics, add:

```yaml
wallpanel:
  photo_selector_debug_people: true
  photo_selector_person_entity: input_text.portal_recognised_people
  # Optional: raw camera recognition, BEFORE the persistence window is applied
  # photo_selector_camera_person_entity: input_text.portal_camera_people
```

The overlay shows the current image and its tagged people, the raw camera result
(or **Not configured** if no raw camera entity is supplied), and the names retained
in the recognition persistence window. It shows per-person counts only for people
in the current image, currently detected by the camera, or retained in that
window. **Total** counts photos valid for selection (rating weight greater than
zero and passing filename filters); **next eligible** additionally applies the
current history and orientation restrictions. The persistence window duration is
controlled by your recognition automation, not by WallPanel.

An empty or omitted entity setting disables person preference. The Home Assistant
helper can contain comma-separated names, `Unknown`, or `None`. On each photo
transition, matching photographs are preferred among photos still eligible under
the existing **rating**, **portrait-to-landscape** and **repeat-history** rules.
If there are no eligible photos of the recognised person, ordinary weighted random
selection continues. Unrated photos remain governed by configured rating frequencies;
zero-weight photos are never displayed. Several recognised people are matched with
OR semantics (photos containing any recognised person).

The [server-side integration](https://github.com/g-j-h-1/ha-wallpanel-photo-selector) reads this file when the browser requests photo metadata;
the slideshow reads the live helper state at each photo transition. You must refresh
the WallPanel media list (or reload the dashboard) for changes to the JSON index to
appear. The JSON is metadata only and is ignored by the JPEG scanner. No Immich API
key or database credentials are stored in Home Assistant.

## Repository responsibilities

This repository contains the **kiosk/Lovelace frontend** and its JavaScript tests. It is installed through HACS as a dashboard frontend resource (`wallpanel.js`).

The **Home Assistant backend** is maintained separately in [ha-wallpanel-photo-selector](https://github.com/g-j-h-1/ha-wallpanel-photo-selector). Install and update that repository separately through HACS for photo scanning, rating metadata, the Photo Library, and Immich person indexing. The backend's Python code and tests belong in that server repository, not here.
