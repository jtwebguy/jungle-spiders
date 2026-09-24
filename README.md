# Jungle Spiders 🕷️

A first-person jungle survival shooter built with [three.js](https://threejs.org/).

Spiders from mouse-sized to dog-sized swarm you in waves and **leap** at your face.
Fight back with an **M4A1-S** and a **M1911**, and scavenge **ammo crates** and **med kits**
scattered through the jungle (look for the light beams).

**Play:** https://jtwebguy.github.io/jungle-spiders/

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Aim |
| Left click | Shoot (M4 is full-auto, 1911 is semi-auto) |
| Shift | Sprint |
| Space | Jump |
| R | Reload |
| G / Right click | Throw selected throwable |
| 3 / 4 / 5 or T | Select stun grenade / frag grenade / molotov (T cycles) |
| 1 / 2 / Q / Mouse wheel | Switch weapon |
| Esc | Pause |

## Gameplay

- **Spiders**: sizes range from ~15 cm (mouse) to ~1 m (dog). Small ones are fast and die in one hit; big ones are tanky and hit hard. They skitter toward you, crouch, then leap in an arc aimed at your head. Later waves bring more of the big ones.
- **Weapons**: M4A1-S — 30-round mag, 34 dmg. M1911 — 7-round mag, 55 dmg, very accurate.
- **Bosses**: every wave has a boss spider that arrives mid-wave — each one bigger than the last (1.5 m leg span on wave 1, 3.7 m on wave 5, 6.5 m on wave 10 and still growing). Bosses leap and slam the ground with a shockwave, call in swarms of babies from wave 2, and drop loot when they die.
- **Throwables** (random drops from dead spiders; bosses drop one of each unlocked type):
  - **Stun grenade** (from wave 3, carry 4): blinding flash after ~1.6 s. Every spider within 10 m — even ones mid-leap — drops and twitches helplessly for 5 s (bosses 3 s). Don't look at it up close.
  - **Frag grenade** (from wave 5, carry 6): bounces, explodes after ~2 s, sends spiders flying. Keep your distance.
  - **Molotov** (from wave 8, carry 4): shatters on impact into an 8-second pool of fire that burns anything walking through it — and sets spiders alight. Don't stand in it yourself.
- **Pickups**: ammo crates refill both guns, med kits heal 35 HP. They respawn elsewhere 25 s after pickup, and dead spiders sometimes drop small ones.

## Running locally

The models are loaded with `fetch`, so open it through a local web server instead of double-clicking `index.html`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Files

- `index.html`, `style.css`, `main.js` — the game (three.js is loaded from the jsDelivr CDN)
- `spider.stl`, `m4a1.stl`, `m1911.stl` — 3D models (simplified and reoriented from the originals)
- All sound effects are synthesized live with the Web Audio API — no audio files needed.
