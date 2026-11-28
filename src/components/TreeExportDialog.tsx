import { useEffect, useRef, useState, type RefObject } from 'react';
import { DownloadSimple } from '../icons.ts';
import { boardSvgFile, drawBoardPicture, pageScale, pdfOfPages, prepareBoard, type BoardPicture, type BoardRect, type PdfPage, type PreparedBoard } from '../lib/boardExport.ts';
import { SITE_URL } from '../lib/credits.ts';
import { CloseButton } from './CloseButton.tsx';

/** A footer: what the page is on the left, the site on the right. */
const footFor = (left: string) => ({
  left,
  right: `Made with Family Trees Whiteboard · ${SITE_URL.replace(/^https?:\/\//, '')}`,
  url: SITE_URL,
});

/** Two frames: React mounts every card, then the browser lays them out. */
const nextFrames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/**
 * The whole tree as one file: everything the board shows now (the Filters
 * and hidden secrets apply), with a footer naming it and linking to the site.
 * A PNG, or a PDF whose footer link can be clicked. Made on this device.
 */
export function TreeExportDialog({
  svgRef,
  summary,
  pages,
  onExporting,
  onClose,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  /** The footer's words: "364 sims in 26 worlds". */
  summary: string;
  /** Each world's part of the board: a page of its own in the PDF, readable as the board is. */
  pages: { world: string; rect: BoardRect }[];
  /** Mounts every card on the stage, named, while it is drawn. */
  onExporting: (on: boolean) => void;
  onClose: () => void;
}) {
  const [picture, setPicture] = useState<BoardPicture | null>(null);
  const [board, setBoard] = useState<PreparedBoard | null>(null);
  const [progress, setProgress] = useState('');
  const [png, setPng] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [making, setMaking] = useState<'' | 'pdf'>('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    closeRef.current?.focus();
    let alive = true;
    let made: string | null = null;
    (async () => {
      onExporting(true);
      try {
        await nextFrames();
        const svg = svgRef.current;
        const scene = svg?.querySelector<SVGGElement>('#scene');
        if (!svg || !scene) throw new Error('No board');
        const prepared = await prepareBoard(svg, scene);
        // The board is drawn from its copy now: the stage goes back to its window.
        onExporting(false);
        const pic = await drawBoardPicture(prepared, footFor(`Family tree · ${summary}`));
        if (alive) setBoard(prepared);
        const blob = await new Promise<Blob>((resolve, reject) =>
          pic.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'),
        );
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setPicture(pic);
        setPng({ blob, url: made });
      } catch {
        if (alive) setFailed(true);
      } finally {
        onExporting(false);
      }
    })();
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // Drawn once, as the board stood when it opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const pageOf = async (pic: BoardPicture): Promise<PdfPage> => {
    const jpeg = await new Promise<Blob>((resolve, reject) =>
      pic.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/jpeg', 0.88),
    );
    return { jpeg: new Uint8Array(await jpeg.arrayBuffer()), w: pic.canvas.width, h: pic.canvas.height, link: pic.link };
  };
  /** The PDF: the whole tree first, then each world on a page of its own, at a size to read. */
  const savePdf = async () => {
    if (!picture || !board) return;
    setMaking('pdf');
    try {
      const out: PdfPage[] = [await pageOf(picture)];
      for (const [i, pg] of pages.entries()) {
        setProgress(`${pg.world}, page ${i + 2} of ${pages.length + 1}`);
        const pic = await drawBoardPicture(board, footFor(`${pg.world} · Family tree`), pg.rect, pageScale(pg.rect.w, pg.rect.h));
        out.push(await pageOf(pic));
      }
      save(pdfOfPages(out), `family-tree-${stamp}.pdf`);
    } finally {
      setMaking('');
      setProgress('');
    }
  };

  return (
    <div
      className="poster"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tree-export-title"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="poster__card" onClick={(e) => e.stopPropagation()}>
        <div className="poster__head">
          <h2 id="tree-export-title">The whole tree</h2>
          <CloseButton ref={closeRef} label="Close" onClick={onClose} />
        </div>
        <div className="poster__view">
          {png ? (
            <img src={png.url} alt={`The whole family tree: ${summary}`} />
          ) : (
            <p className="poster__wait" role="status">
              {failed ? 'This browser couldn’t draw the whole tree.' : 'Drawing the whole tree'}
            </p>
          )}
        </div>
        <p className="poster__lead">
          Everything the board shows now: Filters and hidden secrets apply. The PNG is the whole tree at a glance; the
          PDF adds a page for each world, at a size to read; the SVG zooms as far as you like. Each links to the site.
          Made on this device from your board: nothing is uploaded.
        </p>
        {progress && (
          <p className="poster__lead" role="status">
            {`Drawing ${progress}`}
          </p>
        )}
        <div className="poster__acts">
          <button type="button" className="poster__btn" disabled={!board} onClick={() => board && save(boardSvgFile(board), `family-tree-${stamp}.svg`)}>
            <DownloadSimple aria-hidden="true" /> SVG
          </button>
          <button type="button" className="poster__btn" disabled={!board || making === 'pdf'} onClick={() => void savePdf()}>
            <DownloadSimple aria-hidden="true" /> {making === 'pdf' ? 'Making the PDF' : 'PDF'}
          </button>
          <button
            type="button"
            className="poster__btn poster__btn--go"
            disabled={!png}
            onClick={() => png && save(png.blob, `family-tree-${stamp}.png`)}
          >
            <DownloadSimple aria-hidden="true" /> PNG
          </button>
        </div>
      </div>
    </div>
  );
}
