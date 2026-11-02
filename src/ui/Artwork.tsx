import { memo, useMemo } from 'react';
import type { Asset, Project } from '../model';
import { transform } from '../model';
import { assetMarkup } from '../svg';
export const SvgContent = memo(function SvgContent({
  asset,
  prefix,
  palette,
  backdrop,
}: {
  asset: Asset;
  prefix: string;
  palette: Project['palette'];
  backdrop?: { width: number; height: number };
}) {
  const html = useMemo(
    () => assetMarkup(asset, prefix, palette, backdrop),
    [asset, prefix, palette, backdrop?.width, backdrop?.height],
  );
  return <g dangerouslySetInnerHTML={{ __html: html }} />;
});
export function Artwork({ project, prefix }: { project: Project; prefix: string }) {
  const background = project.assets.find((a) => a.id === project.backdropId);
  return (
    <svg
      viewBox={`0 0 ${project.width} ${project.height}`}
      aria-hidden="true"
      className="artwork-preview"
    >
      {background && (
        <SvgContent
          asset={background}
          prefix={`${prefix}-backdrop`}
          palette={project.palette}
          backdrop={project}
        />
      )}
      {project.items.map((i) => {
        const a = project.assets.find((a) => a.id === i.assetId)!;
        return (
          <g key={i.id} transform={transform(i, project.scale)}>
            <SvgContent asset={a} prefix={`${prefix}-${i.id}`} palette={project.palette} />
          </g>
        );
      })}
    </svg>
  );
}
