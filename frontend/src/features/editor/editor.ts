import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';

import { EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
} from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';

import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

/* =========================================================
   Widgets
   ========================================================= */

class CheckboxWidget extends WidgetType {
  constructor(
    private checked: boolean,
    private from: number,
    private to: number
  ) {
    super();
  }

  override eq(other: CheckboxWidget): boolean {
    return (
      other.checked === this.checked &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.checked;

    checkbox.addEventListener('mousedown', (e) => e.preventDefault());
    checkbox.addEventListener('change', () => {
      const next = checkbox.checked ? '[x]' : '[ ]';
      view.dispatch({ changes: { from: this.from, to: this.to, insert: next } });
      view.focus();
    });

    wrap.appendChild(checkbox);
    return wrap;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

class HiddenMarkerWidget extends WidgetType {
  // Oculta el marcador (p.ej. "## " o "# ") cuando NO estás editando la línea
  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.style.display = 'none';
    return span;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/* =========================================================
   Plugin: render headings (oculta "# " / "## " y estiliza línea),
   pero SOLO cuando NO estás en esa línea (línea activa => sin render)
   ========================================================= */

function headingDecorationsSkipActiveLine() {
  return ViewPlugin.fromClass(
    class {
      decorations: any;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: any) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = this.build(update.view);
        }
      }

      build(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        const { state } = view;

        const activeLine = state.doc.lineAt(state.selection.main.head);

        for (const { from, to } of view.visibleRanges) {
          let pos = from;

          while (pos <= to) {
            const line = state.doc.lineAt(pos);

            // Si estás editando ESTA línea, no renderizamos heading (ves "## " real)
            if (line.number === activeLine.number) {
              pos = line.to + 1;
              continue;
            }

            const text = line.text;

            // Detecta ATX headings: "# ", "## ", ... "###### "
            const m = text.match(/^(#{1,6})\s+(.*)$/);
            if (m) {
              const level = m[1].length; // 1..6
              const markerLen = m[1].length + 1; // hashes + espacio
              const markerFrom = line.from;
              const markerTo = line.from + markerLen;

              // 1) Oculta el marcador "# "
              builder.add(
                markerFrom,
                markerTo,
                Decoration.replace({ widget: new HiddenMarkerWidget() })
              );

              // 2) Estiliza la línea completa como heading
              builder.add(
                line.from,
                line.from,
                Decoration.line({ class: `md-h${level}` })
              );
            }

            pos = line.to + 1;
          }
        }

        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}

/* =========================================================
   Plugin: checkbox widget para "- [ ]" / "- [x]"
   SOLO cuando NO estás en esa línea
   ========================================================= */

function checkboxDecorationsSkipActiveLine() {
  return ViewPlugin.fromClass(
    class {
      decorations: any;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: any) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = this.build(update.view);
        }
      }

      build(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        const { state } = view;

        const activeLine = state.doc.lineAt(state.selection.main.head);

        for (const { from, to } of view.visibleRanges) {
          let pos = from;

          while (pos <= to) {
            const line = state.doc.lineAt(pos);

            // Si estás editando ESTA línea, no ponemos checkbox widget (ves "[ ]" real)
            if (line.number === activeLine.number) {
              pos = line.to + 1;
              continue;
            }

            const text = line.text;
            const match = text.match(/^\s*-\s*\[( |x|X)\]/);

            if (match) {
              const checked = match[1].toLowerCase() === 'x';
              const bracketIndex = text.indexOf('[');

              if (bracketIndex !== -1) {
                const fromAbs = line.from + bracketIndex;
                const toAbs = fromAbs + 3; // "[ ]" o "[x]"

                builder.add(
                  fromAbs,
                  toAbs,
                  Decoration.replace({
                    widget: new CheckboxWidget(checked, fromAbs, toAbs),
                  })
                );
              }
            }

            pos = line.to + 1;
          }
        }

        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}

/* =========================================================
   Theme: hace que los headings "se vean bien" sin HTML
   ========================================================= */

const markdownLooksTheme = EditorView.theme({
  '.cm-content': {
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
    lineHeight: '1.6',
  },

  // Clases de línea aplicadas por Decoration.line({class: ...})
  '.cm-line.md-h1': { fontSize: '1.8em', fontWeight: '750', lineHeight: '1.35' },
  '.cm-line.md-h2': { fontSize: '1.5em', fontWeight: '740', lineHeight: '1.35' },
  '.cm-line.md-h3': { fontSize: '1.25em', fontWeight: '720', lineHeight: '1.35' },
  '.cm-line.md-h4': { fontSize: '1.1em', fontWeight: '700', lineHeight: '1.35' },
  '.cm-line.md-h5': { fontSize: '1.0em', fontWeight: '680', lineHeight: '1.35' },
  '.cm-line.md-h6': { fontSize: '0.95em', fontWeight: '660', lineHeight: '1.35' },
});

/* =========================================================
   Angular standalone component
   ========================================================= */

@Component({
  selector: 'app-editor',
  standalone: true,
  template: `
    <div class="shell">
      <div class="toolbar">
        <button type="button" (click)="export()">Export</button>
        <span class="hint">
          Prueba: "## Heading", "- [ ] task", "**bold**".
          Al editar una línea ves el markdown; al salir, se “renderiza” (sin HTML).
        </span>
      </div>

      <div #host class="editor"></div>

      <pre class="out">{{ exported }}</pre>
    </div>
  `,
  styles: [`
    .shell { max-width: 900px; margin: 16px auto; }
    .toolbar { display:flex; gap: 12px; align-items:center; margin-bottom: 10px; }
    button { padding: 8px 10px; border-radius: 10px; border: 1px solid #ddd; background: #fff; cursor: pointer; }
    button:hover { background: #f7f7f7; }
    .hint { color: #666; font-size: 13px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    .editor { border: 1px solid #ddd; border-radius: 12px; padding: 10px; min-height: 260px; box-shadow: 0 1px 8px rgba(0,0,0,.04); }
    .out { margin-top: 12px; padding: 10px; background: #f7f7f7; border: 1px solid #eee; border-radius: 10px; overflow:auto; }
  `],
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true })
  host!: ElementRef<HTMLDivElement>;

  private view: EditorView | null = null;
  exported = '';

  ngAfterViewInit(): void {
    const state = EditorState.create({
      doc: [
        '## Hola Heading',
        '',
        '- [ ] Comprar leche',
        '- [x] Pagar factura',
        '',
        'Texto normal con **negrita** y `inline code`.',
        '',
        '> Una cita en markdown',
      ].join('\n'),
      extensions: [
        keymap.of(defaultKeymap),
        EditorView.lineWrapping,

        // ✅ Markdown “se ve bien” (highlight + estructura)
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),

        // ✅ “Render Logseq-like” SOLO fuera de la línea activa
        headingDecorationsSkipActiveLine(),
        checkboxDecorationsSkipActiveLine(),

        // ✅ theme para headings
        markdownLooksTheme,
      ],
    });

    this.view = new EditorView({
      state,
      parent: this.host.nativeElement,
    });
  }

  ngOnDestroy(): void {
    this.view?.destroy();
    this.view = null;
  }

  export(): void {
    if (!this.view) return;
    this.exported = this.view.state.doc.toString();
  }
}