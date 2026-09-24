# Jungle Spiders 🕷️

A first-person jungle survival shooter built with [three.js](https://threejs.org/).

Spiders from mouse-sized to dog-sized swarm you in waves and **leap** at your face.
Fight back with an **M4A1-S** and a **M1911**, and scavenge **ammo crates** and **med kits**
scattered through the jungle (look for the light beams).

**Play:** https://<your-username>.github.io/jungle-spiders/ (after GitHub Pages is enabled)

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Aim |
| Left click | Shoot (M4 is full-auto, 1911 is semi-auto) |
| Shift | Sprint |
| Space | Jump |
| R | Reload |
| 1 / 2 / Q / Mouse wheel | Switch weapon |
| Esc | Pause |

## Gameplay

- **Spiders**: sizes range from ~15 cm (mouse) to ~1 m (dog). Small ones are fast and die in one hit; big ones are tanky and hit hard. They skitter toward you, crouch, then leap in an arc aimed at your head. Later waves bring more of the big ones.
- **Weapons**: M4A1-S — 30-round mag, 34 dmg. M1911 — 7-round mag, 55 dmg, very accurate.
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
