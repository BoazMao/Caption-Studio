# Timeline and editing fixes

The transcription/alignment migration is tracked separately in [WHISPERX_MIGRATION.md](WHISPERX_MIGRATION.md).

- [x] Overlay source and translation caption blocks on the waveform, with the waveform expanded to use the available timeline height. Keep the blocks legible and the waveform visible around them at supported window sizes, including after zooming or resizing.
- [x] Make waveform detail scale with timeline zoom: zooming in should reveal more time detail rather than stretching or repeating the same coarse peaks. The waveform, ruler, playhead, and caption blocks must stay synchronized while scrolling.
- [x] Add caption multi-selection and familiar editing operations: select all, copy, cut, paste, and delete. Support Ctrl+A/C/X/V (and equivalent platform shortcuts) when focus is on the caption list or timeline, while preserving native text-field shortcuts. Pasted captions need new stable IDs, predictable timing, and undo/redo support.
- [x] Flag overlapping captions with a visible warning icon on every affected subtitle block, plus an accessible tooltip explaining the conflicting time range. Compare distinct captions within a track; the linked source and translation blocks for one caption are not a conflict. Captions whose boundaries only touch are not overlapping.
- [x] Add interaction tests for zoomed waveform positioning, caption overlays, selection, clipboard shortcuts, and undo/redo after paste.

- [x] Show overlap warnings using only the warning icon and its accessible tooltip. Remove the full-block overlap outline/highlight; reserve that outline/highlight for selected blocks. Verify that an overlapping unselected block has no selection-style outline, and that selecting it still displays both the selection outline and warning icon.
