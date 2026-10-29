//! Where the quick popup goes: next to the mouse pointer, fully on one screen.
//!
//! Everything here is in physical pixels, the unit of the pointer position and of monitor
//! rectangles on Windows. Only the popup's size depends on the screen's scale factor.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    pub fn right(&self) -> i32 {
        self.x + self.w
    }
    pub fn bottom(&self) -> i32 {
        self.y + self.h
    }
    fn contains(&self, (px, py): (i32, i32)) -> bool {
        px >= self.x && px < self.right() && py >= self.y && py < self.bottom()
    }
    /// Squared distance from a point to the rectangle (0 inside).
    fn distance_sq(&self, (px, py): (i32, i32)) -> i64 {
        let dx = (self.x - px).max(0).max(px - (self.right() - 1)) as i64;
        let dy = (self.y - py).max(0).max(py - (self.bottom() - 1)) as i64;
        dx * dx + dy * dy
    }
}

/// A screen: its usable area (without the taskbar) and its DPI scale (1.0 = 96 dpi).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Screen {
    pub work: Rect,
    pub scale: f64,
}

/// The screen under the pointer, or the nearest one if the pointer is in a gap or outside.
pub fn pick_screen(screens: &[Screen], cursor: (i32, i32)) -> Option<Screen> {
    screens
        .iter()
        .find(|s| s.work.contains(cursor))
        .or_else(|| screens.iter().min_by_key(|s| s.work.distance_sq(cursor)))
        .copied()
}

/// The popup's physical size for a logical size on a screen with this scale.
pub fn physical_size(logical: (f64, f64), scale: f64) -> (i32, i32) {
    ((logical.0 * scale).round() as i32, (logical.1 * scale).round() as i32)
}

/// The popup's rectangle: just right of and below the pointer, flipped to the other side when
/// that would run off the screen, and clamped into the work area as a last resort.
pub fn place(cursor: (i32, i32), size: (i32, i32), screen: Screen) -> Rect {
    let work = screen.work;
    let w = size.0.min(work.w);
    let h = size.1.min(work.h);
    let dx = (12.0 * screen.scale).round() as i32;
    let dy = (16.0 * screen.scale).round() as i32;
    let mut x = cursor.0 + dx;
    if x + w > work.right() {
        x = cursor.0 - dx - w;
    }
    let mut y = cursor.1 + dy;
    if y + h > work.bottom() {
        y = cursor.1 - dy - h;
    }
    Rect {
        x: x.clamp(work.x, (work.right() - w).max(work.x)),
        y: y.clamp(work.y, (work.bottom() - h).max(work.y)),
        w,
        h,
    }
}

/// Where the user last dragged the popup, relative to the pointer when it opened (logical pixels).
pub type Offset = (f64, f64);

/// The popup's rectangle at a remembered offset from the pointer, kept inside the work area.
pub fn place_at_offset(cursor: (i32, i32), size: (i32, i32), screen: Screen, offset: Offset) -> Rect {
    let work = screen.work;
    let w = size.0.min(work.w);
    let h = size.1.min(work.h);
    let x = cursor.0 + (offset.0 * screen.scale).round() as i32;
    let y = cursor.1 + (offset.1 * screen.scale).round() as i32;
    Rect {
        x: x.clamp(work.x, (work.right() - w).max(work.x)),
        y: y.clamp(work.y, (work.bottom() - h).max(work.y)),
        w,
        h,
    }
}

/// The offset that would reproduce a window position for this pointer position.
pub fn offset_of(cursor: (i32, i32), window: (i32, i32), scale: f64) -> Offset {
    ((window.0 - cursor.0) as f64 / scale, (window.1 - cursor.1) as f64 / scale)
}

/// Pick the screen, size and position in one go. A remembered offset replaces the default
/// "below and right of the pointer" placement.
pub fn place_on_screens(cursor: (i32, i32), logical_size: (f64, f64), screens: &[Screen], offset: Option<Offset>) -> Option<Rect> {
    let screen = pick_screen(screens, cursor)?;
    let size = physical_size(logical_size, screen.scale);
    Some(match offset {
        Some(offset) => place_at_offset(cursor, size, screen, offset),
        None => place(cursor, size, screen),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIZE: (f64, f64) = (420.0, 260.0);

    fn screen(x: i32, y: i32, w: i32, h: i32, scale: f64) -> Screen {
        Screen { work: Rect { x, y, w, h }, scale }
    }

    fn inside(r: Rect, s: Screen) -> bool {
        r.x >= s.work.x && r.y >= s.work.y && r.right() <= s.work.right() && r.bottom() <= s.work.bottom()
    }

    #[test]
    fn goes_below_and_right_of_the_pointer() {
        let s = screen(0, 0, 1920, 1040, 1.0);
        let r = place_on_screens((500, 400), SIZE, &[s], None).unwrap();
        assert_eq!(r, Rect { x: 512, y: 416, w: 420, h: 260 });
    }

    #[test]
    fn flips_left_near_the_right_edge_and_up_near_the_bottom() {
        let s = screen(0, 0, 1920, 1040, 1.0);
        let r = place_on_screens((1850, 400), SIZE, &[s], None).unwrap();
        assert_eq!((r.x, r.y), (1850 - 12 - 420, 416));
        let r = place_on_screens((500, 1000), SIZE, &[s], None).unwrap();
        assert_eq!((r.x, r.y), (512, 1000 - 16 - 260));
        let r = place_on_screens((1900, 1030), SIZE, &[s], None).unwrap();
        assert!(inside(r, s));
        assert_eq!((r.x, r.y), (1900 - 12 - 420, 1030 - 16 - 260));
    }

    #[test]
    fn stays_on_screen_in_every_corner() {
        let s = screen(0, 0, 1920, 1040, 1.0);
        for cursor in [(0, 0), (1919, 0), (0, 1039), (1919, 1039), (960, 520)] {
            let r = place_on_screens(cursor, SIZE, &[s], None).unwrap();
            assert!(inside(r, s), "{cursor:?} -> {r:?}");
        }
    }

    #[test]
    fn a_second_monitor_to_the_right_or_left() {
        let left = screen(-1920, 0, 1920, 1040, 1.0);
        let main = screen(0, 0, 1920, 1040, 1.0);
        let right = screen(1920, -200, 2560, 1400, 1.0);
        let all = [left, main, right];

        let r = place_on_screens((2500, 300), SIZE, &all, None).unwrap();
        assert!(inside(r, right));
        assert_eq!((r.x, r.y), (2512, 316));

        let r = place_on_screens((-300, 500), SIZE, &all, None).unwrap();
        assert!(inside(r, left), "{r:?}");
        assert_eq!(r.x, -300 - 12 - 420, "no room on the right of the left screen, so it flips");

        // At the seam the popup stays on the screen the pointer is on.
        let r = place_on_screens((1915, 500), SIZE, &all, None).unwrap();
        assert!(inside(r, main));
    }

    #[test]
    fn size_follows_the_dpi_of_the_screen_under_the_pointer() {
        let main = screen(0, 0, 1920, 1080, 1.0);
        let hidpi = screen(1920, 0, 3840, 2160, 2.0);
        let r = place_on_screens((3000, 500), SIZE, &[main, hidpi], None).unwrap();
        assert_eq!((r.w, r.h), (840, 520));
        assert_eq!((r.x, r.y), (3000 + 24, 500 + 32), "the offsets scale too");
        let r = place_on_screens((500, 500), SIZE, &[main, hidpi], None).unwrap();
        assert_eq!((r.w, r.h), (420, 260));

        // 150 % scaling rounds to whole pixels.
        let s150 = screen(0, 0, 2560, 1400, 1.5);
        let r = place_on_screens((100, 100), SIZE, &[s150], None).unwrap();
        assert_eq!((r.w, r.h), (630, 390));
        assert_eq!(physical_size((421.0, 259.0), 1.25), (526, 324));
    }

    #[test]
    fn a_pointer_outside_every_screen_uses_the_nearest() {
        let a = screen(0, 0, 1920, 1080, 1.0);
        let b = screen(1920, 0, 1280, 1024, 1.0);
        assert_eq!(pick_screen(&[a, b], (-50, 500)), Some(a));
        assert_eq!(pick_screen(&[a, b], (4000, 300)), Some(b));
        assert_eq!(pick_screen(&[a, b], (1000, 5000)), Some(a));
        assert_eq!(pick_screen(&[], (0, 0)), None);
        let r = place_on_screens((-50, 500), SIZE, &[a, b], None).unwrap();
        assert!(inside(r, a));
    }

    #[test]
    fn a_popup_bigger_than_the_screen_is_shrunk_to_fit() {
        let small = screen(0, 0, 300, 200, 1.0);
        let r = place_on_screens((150, 100), SIZE, &[small], None).unwrap();
        assert_eq!(r, Rect { x: 0, y: 0, w: 300, h: 200 });
    }

    #[test]
    fn a_remembered_offset_is_reused_and_scaled() {
        let main = screen(0, 0, 1920, 1080, 1.0);
        let hidpi = screen(1920, 0, 3840, 2160, 2.0);
        // The user dragged the popup 100 px left of and 40 px above the pointer.
        let off = offset_of((800, 600), (700, 560), 1.0);
        assert_eq!(off, (-100.0, -40.0));
        let r = place_on_screens((900, 700), SIZE, &[main, hidpi], Some(off)).unwrap();
        assert_eq!((r.x, r.y), (800, 660));
        // On the 200 % screen the same logical offset is twice as many pixels.
        let r = place_on_screens((3000, 700), SIZE, &[main, hidpi], Some(off)).unwrap();
        assert_eq!((r.x, r.y), (3000 - 200, 700 - 80));
        // Measuring on a 200 % screen gives back logical pixels.
        assert_eq!(offset_of((3000, 700), (2800, 620), 2.0), (-100.0, -40.0));
    }

    #[test]
    fn a_remembered_offset_never_leaves_the_screen() {
        let s = screen(0, 0, 1920, 1040, 1.0);
        let r = place_on_screens((1900, 1000), SIZE, &[s], Some((300.0, 300.0))).unwrap();
        assert!(inside(r, s));
        let r = place_on_screens((10, 10), SIZE, &[s], Some((-500.0, -500.0))).unwrap();
        assert_eq!((r.x, r.y), (0, 0));
    }

    #[test]
    fn the_taskbar_is_respected_through_the_work_area() {
        // Work area without a 48 px taskbar at the bottom.
        let s = screen(0, 0, 1920, 1032, 1.0);
        let r = place_on_screens((500, 900), SIZE, &[s], None).unwrap();
        assert!(r.bottom() <= 1032);
    }
}
