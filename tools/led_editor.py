#!/usr/bin/env python3
"""可视化编辑 src/game/ledFont.ts 的点阵字库，并预览跑马灯效果。

用法：
    py tools/led_editor.py
    py tools/led_editor.py --font path/to/ledFont.ts
    py tools/led_editor.py --check
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import tkinter as tk
from pathlib import Path
from tkinter import messagebox

DEFAULT_FONT = Path(__file__).resolve().parents[1] / "src" / "game" / "ledFont.ts"

LED_GAP = 1
LED_PAD = 2
PREVIEW_PITCH = 10
GAME_PITCH = 3
GAME_SPEED = 40
PREVIEW_SPEED = GAME_SPEED * PREVIEW_PITCH / GAME_PITCH

BG = "#0b1514"
PANEL = "#0f1d1a"
PANEL_2 = "#0a1412"
BORDER = "#27403a"
CELL_BG = "#101f1c"
GRID = "#1d302b"
DOT = "#ffd24a"
DOT_OFF = "#1f332f"
TEXT = "#e6efe9"
MUTED = "#8ba49a"
WARN = "#ff9b7a"
BUTTON = "#17332d"
BUTTON_ACTIVE = "#245046"

DEFAULT_TEXT = (
    "下一站：昆山站　　终点站：北京站　　"
    "next station: Kunshan Station　　terminal station: Beijing Station"
)

ROWS_CONST_RE = re.compile(r"export\s+const\s+LED_ROWS\s*=\s*(\d+)\s*;")
GLYPH_RE = re.compile(r'^\s{2}("(?:[^"\\]|\\.)*")\s*:\s*\[\s*$', re.MULTILINE)
ROW_RE = re.compile(r'"([01]+)"')


def load_font(path: Path) -> tuple[int, list[str], dict[str, list[str]]]:
    text = path.read_text(encoding="utf-8")
    rows_match = ROWS_CONST_RE.search(text)
    if not rows_match:
        raise ValueError("没有找到 export const LED_ROWS = N;")
    rows_count = int(rows_match.group(1))
    order: list[str] = []
    glyphs: dict[str, list[str]] = {}
    for match in GLYPH_RE.finditer(text):
        end = text.find("  ],", match.end())
        if end < 0:
            raise ValueError(f"字符 {match.group(1)} 的字形没有结束标记")
        glyph_rows = ROW_RE.findall(text[match.end():end])
        ch = json.loads(match.group(1))
        if ch in glyphs:
            raise ValueError(f"字符 {ch!r} 重复出现")
        if len(glyph_rows) != rows_count:
            raise ValueError(f"字符 {ch!r} 有 {len(glyph_rows)} 行，应为 {rows_count} 行")
        widths = {len(row) for row in glyph_rows}
        if len(widths) != 1 or 0 in widths:
            raise ValueError(f"字符 {ch!r} 的各行列宽不一致")
        if any(set(row) - {"0", "1"} for row in glyph_rows):
            raise ValueError(f"字符 {ch!r} 含有 0/1 以外的字符")
        order.append(ch)
        glyphs[ch] = glyph_rows
    if not order:
        raise ValueError("没有解析到任何字形")
    return rows_count, order, glyphs


def serialize_font(rows_count: int, order: list[str], glyphs: dict[str, list[str]]) -> str:
    lines = [
        f"// {rows_count} 行点阵字库：1 = 亮，0 = 灭。每个字的列数可不同，但同一字的每行必须等宽。",
        "// 跑马灯会在每个字后自动留 1 列空列；直接修改下面的 0/1 即可改字形。",
        "// 也可以用 tools/led_editor.py 可视化修改并写回本文件。",
        "",
        f"export const LED_ROWS = {rows_count};",
        "",
        "export const LED_FONT: Record<string, string[]> = {",
    ]
    for ch in order:
        glyph_rows = glyphs[ch]
        widths = {len(row) for row in glyph_rows}
        if len(glyph_rows) != rows_count or len(widths) != 1 or any(
            set(row) - {"0", "1"} for row in glyph_rows
        ):
            raise ValueError(f"字符 {ch!r} 的字形不合法")
        lines.append(f"  {json.dumps(ch, ensure_ascii=False)}: [")
        for row in glyph_rows:
            lines.append(f'    "{row}",')
        lines.append("  ],")
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def save_font(path: Path, rows_count: int, order: list[str], glyphs: dict[str, list[str]]) -> None:
    text = serialize_font(rows_count, order, glyphs)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8", newline="\n")
    os.replace(tmp, path)


def fallback_glyph(rows_count: int) -> list[str]:
    return ["1" * 10] + ["1" + "0" * 8 + "1"] * (rows_count - 2) + ["1" * 10]


def compose(
    text: str,
    rows_count: int,
    glyphs: dict[str, list[str]],
    fallback: list[str],
) -> tuple[list[str], str]:
    text = text.replace("\n", "").replace("\r", "")
    rows = ["0" * LED_PAD for _ in range(rows_count)]
    missing: list[str] = []
    for ch in text:
        glyph = glyphs.get(ch)
        if glyph is None:
            glyph = fallback
            if ch not in missing:
                missing.append(ch)
        width = len(glyph[0])
        gap = "0" * LED_GAP
        rows = [row + glyph[y] + gap for y, row in enumerate(rows)]
    rows = [row + "0" * LED_PAD for row in rows]
    return rows, "".join(missing)


def char_label(ch: str, rows: list[str]) -> str:
    if ch == " ":
        name = "空格"
    elif ch == "\u3000":
        name = "全角空格"
    elif ch == "\t":
        name = "制表符"
    else:
        name = f'"{ch}"'
    return f"{name}   U+{ord(ch):04X}   {len(rows[0])} 列"


class LedEditor:
    CELL = 22
    GRID_PAD = 10

    def __init__(self, root: tk.Tk, path: Path) -> None:
        self.root = root
        self.path = path
        self.rows_count, self.order, self.glyphs = load_font(path)
        self.original = {ch: rows[:] for ch, rows in self.glyphs.items()}
        self.fallback = fallback_glyph(self.rows_count)
        self.current = self.order[0]
        self.modified = False
        self.paint_value = "1"
        self.painted: set[tuple[int, int]] = set()
        self.offset = 0.0
        self.last_tick = time.perf_counter()
        self.preview_rows: list[str] = []
        self.preview_missing = ""

        self._build_ui()
        self._select_index(0)
        self._refresh_preview()
        self.root.after(40, self._tick)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    # ---------- UI ----------

    def _button(self, parent: tk.Misc, text: str, command, accent: bool = False) -> tk.Button:
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=DOT if accent else BUTTON,
            fg="#101a12" if accent else TEXT,
            activebackground="#ffdf7a" if accent else BUTTON_ACTIVE,
            activeforeground="#101a12" if accent else TEXT,
            relief="flat",
            bd=0,
            padx=14,
            pady=5,
            cursor="hand2",
            font=("Microsoft YaHei UI", 10),
        )

    def _build_ui(self) -> None:
        root = self.root
        root.title("京沪神车 1462 · LED 点阵字库编辑器")
        root.configure(bg=BG)
        width, height = 1140, 820
        screen_w = root.winfo_screenwidth()
        screen_h = root.winfo_screenheight()
        left = max(20, (screen_w - width) // 2)
        top = max(20, (screen_h - height) // 2 - 20)
        root.geometry(f"{width}x{height}+{left}+{top}")
        root.minsize(1000, 720)

        header = tk.Frame(root, bg=BG)
        header.pack(fill="x", padx=16, pady=(12, 6))
        tk.Label(
            header,
            text="LED 点阵字库编辑器",
            bg=BG,
            fg=DOT,
            font=("Microsoft YaHei UI", 16, "bold"),
        ).pack(side="left")
        tk.Label(
            header,
            text=f"{self.rows_count} 行 · {len(self.order)} 个字符   {self.path}",
            bg=BG,
            fg=MUTED,
            font=("Microsoft YaHei UI", 9),
        ).pack(side="left", padx=(16, 0), pady=(4, 0))
        self._button(header, "保存到文件  Ctrl+S", self._save, accent=True).pack(
            side="right", pady=(0, 2)
        )

        preview_panel = tk.Frame(
            root, bg=PANEL, highlightthickness=1, highlightbackground=BORDER
        )
        preview_panel.pack(fill="x", padx=16, pady=(0, 10))
        preview_head = tk.Frame(preview_panel, bg=PANEL)
        preview_head.pack(fill="x", padx=12, pady=(8, 4))
        tk.Label(
            preview_head,
            text="跑马灯预览",
            bg=PANEL,
            fg=TEXT,
            font=("Microsoft YaHei UI", 10, "bold"),
        ).pack(side="left")
        tk.Label(
            preview_head,
            text="每字后自动空 1 列 · 点距等比加速",
            bg=PANEL,
            fg=MUTED,
            font=("Microsoft YaHei UI", 9),
        ).pack(side="left", padx=(10, 0))
        self.preview_warn = tk.Label(
            preview_head, text="", bg=PANEL, fg=WARN, font=("Microsoft YaHei UI", 9)
        )
        self.preview_warn.pack(side="right")

        self.text_var = tk.StringVar(value=DEFAULT_TEXT)
        entry = tk.Entry(
            preview_panel,
            textvariable=self.text_var,
            bg=PANEL_2,
            fg=DOT,
            insertbackground=DOT,
            relief="flat",
            highlightthickness=1,
            highlightbackground=BORDER,
            highlightcolor=BORDER,
            font=("Microsoft YaHei UI", 10),
        )
        entry.pack(fill="x", padx=12, pady=(0, 8))
        self.text_var.trace_add("write", lambda *_: self._refresh_preview())

        height = self.rows_count * PREVIEW_PITCH + 20
        self.preview = tk.Canvas(
            preview_panel,
            height=height,
            bg=PANEL_2,
            highlightthickness=0,
        )
        self.preview.pack(fill="x", padx=12, pady=(0, 12))

        toolbar = tk.Frame(root, bg=BG)
        toolbar.pack(fill="x", padx=16, pady=(0, 8))
        for text, command in (
            ("加一列", self._add_column),
            ("删一列", self._remove_column),
            ("左移", lambda: self._shift(-1, 0)),
            ("右移", lambda: self._shift(1, 0)),
            ("上移", lambda: self._shift(0, -1)),
            ("下移", lambda: self._shift(0, 1)),
            ("清空此字", self._clear_glyph),
            ("恢复此字", self._restore_glyph),
            ("重新载入", self._reload),
        ):
            self._button(toolbar, text, command).pack(side="left", padx=(0, 8))
        self.dirty_label = tk.Label(
            toolbar, text="未修改", bg=BG, fg=MUTED, font=("Microsoft YaHei UI", 9)
        )
        self.dirty_label.pack(side="right", pady=(4, 0))

        body = tk.Frame(root, bg=BG)
        body.pack(fill="both", expand=True, padx=16, pady=(0, 8))

        left = tk.Frame(body, bg=BG)
        left.pack(side="left", fill="y")
        tk.Label(
            left,
            text=f"字符（{len(self.order)}）",
            bg=BG,
            fg=TEXT,
            font=("Microsoft YaHei UI", 10, "bold"),
        ).pack(anchor="w")
        list_wrap = tk.Frame(left, bg=BG)
        list_wrap.pack(fill="both", expand=True, pady=(6, 0))
        self.listbox = tk.Listbox(
            list_wrap,
            width=28,
            bg=PANEL,
            fg=TEXT,
            selectbackground=DOT,
            selectforeground="#0b1514",
            activestyle="none",
            relief="flat",
            highlightthickness=1,
            highlightbackground=BORDER,
            font=("Microsoft YaHei UI", 11),
            exportselection=False,
        )
        scrollbar = tk.Scrollbar(list_wrap, command=self.listbox.yview)
        self.listbox.configure(yscrollcommand=scrollbar.set)
        self.listbox.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        for ch in self.order:
            self.listbox.insert("end", char_label(ch, self.glyphs[ch]))
        self.listbox.bind("<<ListboxSelect>>", self._on_select)

        right = tk.Frame(body, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=(18, 0))

        info_row = tk.Frame(right, bg=BG)
        info_row.pack(fill="x")
        self.char_big = tk.Label(
            info_row,
            text="",
            width=2,
            bg=BG,
            fg=DOT,
            font=("Microsoft YaHei", 28, "bold"),
        )
        self.char_big.pack(side="left")
        self.char_info = tk.Label(
            info_row, text="", bg=BG, fg=MUTED, font=("Microsoft YaHei UI", 10)
        )
        self.char_info.pack(side="left", padx=(12, 0), pady=(10, 0))
        self.grid_canvas = tk.Canvas(
            right, bg=BG, highlightthickness=0, takefocus=1
        )
        self.grid_canvas.pack(anchor="nw", pady=(10, 8))
        self.grid_canvas.bind("<Button-1>", self._on_grid_down)
        self.grid_canvas.bind("<B1-Motion>", self._on_grid_drag)
        self.grid_canvas.bind("<Left>", lambda _event: self._shift(-1, 0))
        self.grid_canvas.bind("<Right>", lambda _event: self._shift(1, 0))
        self.grid_canvas.bind("<Up>", lambda _event: self._shift(0, -1))
        self.grid_canvas.bind("<Down>", lambda _event: self._shift(0, 1))

        tk.Label(
            right,
            text="左键点亮 / 熄灭，拖动连续绘制；点格子后可用方向键整体平移，越界的点会被裁掉。",
            bg=BG,
            fg=MUTED,
            font=("Microsoft YaHei UI", 9),
        ).pack(anchor="w")

        status = tk.Frame(root, bg=BG)
        status.pack(fill="x", padx=16, pady=(0, 10))
        self.status_label = tk.Label(
            status, text="", bg=BG, fg=MUTED, anchor="w", font=("Microsoft YaHei UI", 9)
        )
        self.status_label.pack(side="left")
        tk.Label(
            status,
            text="保存后 Vite 会自动刷新游戏",
            bg=BG,
            fg=MUTED,
            font=("Microsoft YaHei UI", 9),
        ).pack(side="right")

        self.root.bind("<Control-s>", lambda _event: self._save())

    # ---------- glyph editing ----------

    def _select_index(self, index: int) -> None:
        self.listbox.selection_clear(0, "end")
        self.listbox.selection_set(index)
        self.listbox.activate(index)
        self.listbox.see(index)
        self.current = self.order[index]
        self._render_glyph()

    def _on_select(self, _event=None) -> None:
        sel = self.listbox.curselection()
        if sel and self.order[sel[0]] != self.current:
            self.current = self.order[sel[0]]
            self._render_glyph()

    def _current_rows(self) -> list[str]:
        return self.glyphs[self.current]

    def _render_glyph(self) -> None:
        rows = self._current_rows()
        cols = len(rows[0])
        cell = self.CELL
        pad = self.GRID_PAD
        display = "空格" if self.current in (" ", "\u3000") else self.current
        self.char_big.configure(text=display)
        lit = sum(row.count("1") for row in rows)
        self.char_info.configure(
            text=f"{self.rows_count} 行 × {cols} 列 · {lit} 个亮点 · "
            f"U+{ord(self.current):04X}"
        )
        canvas = self.grid_canvas
        canvas.delete("all")
        canvas.configure(width=cols * cell + pad * 2, height=self.rows_count * cell + pad * 2)
        canvas.create_rectangle(
            pad - 4,
            pad - 4,
            pad + cols * cell + 4,
            pad + self.rows_count * cell + 4,
            outline=BORDER,
            fill=PANEL_2,
        )
        for y in range(self.rows_count):
            for x in range(cols):
                x0 = pad + x * cell
                y0 = pad + y * cell
                canvas.create_rectangle(
                    x0,
                    y0,
                    x0 + cell,
                    y0 + cell,
                    outline=GRID,
                    fill=CELL_BG,
                )
                cx = x0 + cell / 2
                cy = y0 + cell / 2
                if rows[y][x] == "1":
                    r = cell * 0.28
                    canvas.create_oval(
                        cx - r, cy - r, cx + r, cy + r, fill=DOT, outline=""
                    )
                else:
                    r = 1.5
                    canvas.create_oval(
                        cx - r, cy - r, cx + r, cy + r, fill=DOT_OFF, outline=""
                    )

    def _cell_at(self, event) -> tuple[int, int] | None:
        rows = self._current_rows()
        cols = len(rows[0])
        x = event.x - self.GRID_PAD
        y = event.y - self.GRID_PAD
        if x < 0 or y < 0:
            return None
        cx = int(x // self.CELL)
        cy = int(y // self.CELL)
        if cx >= cols or cy >= self.rows_count:
            return None
        return cx, cy

    def _set_cell(self, cx: int, cy: int, value: str) -> None:
        rows = self._current_rows()
        row = list(rows[cy])
        if row[cx] == value:
            return
        row[cx] = value
        rows[cy] = "".join(row)
        self._render_glyph()
        self._refresh_preview()
        self._after_edit()

    def _on_grid_down(self, event) -> None:
        self.grid_canvas.focus_set()
        pos = self._cell_at(event)
        if pos is None:
            return
        cx, cy = pos
        rows = self._current_rows()
        self.paint_value = "0" if rows[cy][cx] == "1" else "1"
        self.painted = set()
        self._paint(cx, cy)

    def _on_grid_drag(self, event) -> None:
        pos = self._cell_at(event)
        if pos is None:
            return
        self._paint(*pos)

    def _paint(self, cx: int, cy: int) -> None:
        if (cx, cy) in self.painted:
            return
        self.painted.add((cx, cy))
        self._set_cell(cx, cy, self.paint_value)

    def _add_column(self) -> None:
        rows = self._current_rows()
        self.glyphs[self.current] = [row + "0" for row in rows]
        self._render_glyph()
        self._refresh_preview()
        self._after_edit()

    def _remove_column(self) -> None:
        rows = self._current_rows()
        if len(rows[0]) <= 1:
            return
        self.glyphs[self.current] = [row[:-1] for row in rows]
        self._render_glyph()
        self._refresh_preview()
        self._after_edit()

    def _shift(self, dx: int, dy: int) -> None:
        rows = self._current_rows()
        width = len(rows[0])
        if abs(dx) >= width or abs(dy) >= self.rows_count:
            self.glyphs[self.current] = ["0" * width for _ in range(self.rows_count)]
            self._render_glyph()
            self._refresh_preview()
            self._after_edit()
            return
        shifted: list[str] = []
        for y in range(self.rows_count):
            src_y = y - dy
            if not 0 <= src_y < self.rows_count:
                shifted.append("0" * width)
                continue
            src = rows[src_y]
            if dx > 0:
                shifted.append("0" * dx + src[: width - dx])
            elif dx < 0:
                shifted.append(src[-dx:] + "0" * (-dx))
            else:
                shifted.append(src)
        self.glyphs[self.current] = shifted
        self._render_glyph()
        self._refresh_preview()
        self._after_edit()

    def _clear_glyph(self) -> None:
        rows = self._current_rows()
        self.glyphs[self.current] = ["0" * len(rows[0]) for _ in rows]
        self._render_glyph()
        self._refresh_preview()
        self._after_edit()

    def _restore_glyph(self) -> None:
        self.glyphs[self.current] = self.original[self.current][:]
        self._render_glyph()
        self._refresh_preview()
        self._after_edit()

    def _after_edit(self) -> None:
        self.modified = any(
            self.glyphs[ch] != self.original[ch] for ch in self.order
        )
        self.dirty_label.configure(
            text="已修改 *" if self.modified else "未修改",
            fg=WARN if self.modified else MUTED,
        )
        index = self.order.index(self.current)
        self.listbox.delete(index)
        self.listbox.insert(index, char_label(self.current, self._current_rows()))
        self.listbox.selection_set(index)
        self.status_label.configure(
            text=f"{len(self.order)} 个字符 · {self.rows_count} 行 · "
            + ("有未保存的修改" if self.modified else f"已同步 {self.path.name}")
        )

    # ---------- preview ----------

    def _refresh_preview(self) -> None:
        text = self.text_var.get()
        self.preview_rows, missing = compose(
            text, self.rows_count, self.glyphs, self.fallback
        )
        self.preview_missing = missing
        if missing:
            self.preview_warn.configure(text=f"缺少字形：{missing}（以方框代替）")
        else:
            self.preview_warn.configure(text="")

    def _tick(self) -> None:
        now = time.perf_counter()
        elapsed = min(0.1, now - self.last_tick)
        self.last_tick = now
        if self.preview_rows:
            total_cols = len(self.preview_rows[0])
            strip_px = max(1, total_cols * PREVIEW_PITCH)
            self.offset = (self.offset + PREVIEW_SPEED * elapsed) % strip_px
            self._draw_preview()
        self.root.after(40, self._tick)

    def _draw_preview(self) -> None:
        canvas = self.preview
        width = canvas.winfo_width()
        height = canvas.winfo_height()
        if width <= 2:
            return
        canvas.delete("dot")
        rows = self.preview_rows
        if not rows:
            return
        total_cols = len(rows[0])
        pad = 10
        start = int(self.offset // PREVIEW_PITCH)
        frac = self.offset - start * PREVIEW_PITCH
        visible = int(width / PREVIEW_PITCH) + 2
        radius = PREVIEW_PITCH * 0.36
        for j in range(start, start + visible):
            col = j % total_cols
            x = pad + (j - start) * PREVIEW_PITCH + PREVIEW_PITCH / 2 - frac
            if x < -PREVIEW_PITCH or x > width + PREVIEW_PITCH:
                continue
            for y in range(self.rows_count):
                if rows[y][col] != "1":
                    continue
                cy = pad + y * PREVIEW_PITCH + PREVIEW_PITCH / 2
                canvas.create_oval(
                    x - radius,
                    cy - radius,
                    x + radius,
                    cy + radius,
                    fill=DOT,
                    outline="",
                    tags="dot",
                )

    # ---------- file ----------

    def _save(self) -> None:
        try:
            save_font(self.path, self.rows_count, self.order, self.glyphs)
        except Exception as exc:  # noqa: BLE001 - show any write/validation error
            messagebox.showerror("保存失败", str(exc), parent=self.root)
            return
        self.original = {ch: rows[:] for ch, rows in self.glyphs.items()}
        self.modified = False
        self.dirty_label.configure(text="未修改", fg=MUTED)
        self.status_label.configure(text=f"已写入 {self.path}")

    def _reload(self) -> None:
        if self.modified and not messagebox.askyesno(
            "重新载入", "当前修改尚未保存，确定丢弃并重新载入？", parent=self.root
        ):
            return
        try:
            rows_count, order, glyphs = load_font(self.path)
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("载入失败", str(exc), parent=self.root)
            return
        if rows_count != self.rows_count or order != self.order:
            messagebox.showerror(
                "载入失败",
                "文件的行数或字符集合已经变化，请重新打开编辑器。",
                parent=self.root,
            )
            return
        self.glyphs = glyphs
        self.original = {ch: rows[:] for ch, rows in glyphs.items()}
        self.modified = False
        self._reload_list()
        self._select_index(self.order.index(self.current))
        self._refresh_preview()
        self.status_label.configure(text=f"已重新载入 {self.path}")

    def _reload_list(self) -> None:
        self.listbox.delete(0, "end")
        for ch in self.order:
            self.listbox.insert("end", char_label(ch, self.glyphs[ch]))

    def _on_close(self) -> None:
        if self.modified:
            answer = messagebox.askyesnocancel(
                "未保存", "字库有修改，是否保存后退出？", parent=self.root
            )
            if answer is None:
                return
            if answer:
                self._save()
                if self.modified:
                    return
        self.root.destroy()


def run_check(path: Path) -> int:
    try:
        rows_count, order, glyphs = load_font(path)
        serialize_font(rows_count, order, glyphs)
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: {exc}")
        return 1
    widths = sorted({len(rows[0]) for rows in glyphs.values()})
    lit = sum(row.count("1") for rows in glyphs.values() for row in rows)
    print(
        f"OK: {path} | {len(order)} glyphs | {rows_count} rows | "
        f"widths {widths[0]}-{widths[-1]} | {lit} lit dots"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="编辑 ledFont.ts 点阵字库")
    parser.add_argument("--font", type=Path, default=DEFAULT_FONT, help="ledFont.ts 路径")
    parser.add_argument("--check", action="store_true", help="只校验，不打开界面")
    args = parser.parse_args()
    path = args.font.resolve()
    if not path.exists():
        print(f"找不到字库文件：{path}", file=sys.stderr)
        return 1
    if args.check:
        return run_check(path)

    try:
        from ctypes import windll

        windll.shcore.SetProcessDpiAwareness(1)
    except Exception:  # noqa: BLE001 - 非 Windows 或系统不支持时忽略
        pass

    root = tk.Tk()
    try:
        LedEditor(root, path)
    except Exception as exc:  # noqa: BLE001
        messagebox.showerror("载入失败", str(exc), parent=root)
        root.destroy()
        return 1
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
