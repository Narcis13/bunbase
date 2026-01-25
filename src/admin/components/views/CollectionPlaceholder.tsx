/**
 * Collection placeholder component.
 * Will be replaced with records table in later plans.
 */

interface CollectionPlaceholderProps {
  collection: string;
}

/**
 * CollectionPlaceholder shows a placeholder for collection view.
 * Will be replaced with actual records table component.
 *
 * @param collection - Name of the collection being viewed
 */
export function CollectionPlaceholder({ collection }: CollectionPlaceholderProps) {
  return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-semibold">{collection}</h2>
      <p className="mt-2 text-muted-foreground">
        Records table coming in next plan
      </p>
    </div>
  );
}
