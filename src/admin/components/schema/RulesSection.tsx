/**
 * RulesSection - Access rules editor for a collection.
 * Shows 5 rule inputs (list, view, create, update, delete).
 * null = admin only, '' = public, string = filter expression.
 */

import { useState, useEffect } from "react";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  fetchCollectionRules,
  updateCollectionRules,
  type CollectionRules,
} from "@/lib/api";

interface RulesSectionProps {
  collection: string;
}

const RULE_FIELDS: { key: keyof CollectionRules; label: string; description: string }[] = [
  { key: "listRule",   label: "List",   description: "Who can list / search records" },
  { key: "viewRule",   label: "View",   description: "Who can view a single record" },
  { key: "createRule", label: "Create", description: "Who can create records" },
  { key: "updateRule", label: "Update", description: "Who can update records" },
  { key: "deleteRule", label: "Delete", description: "Who can delete records" },
];

const DEFAULT_RULES: CollectionRules = {
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export function RulesSection({ collection }: RulesSectionProps) {
  const [rules, setRules] = useState<CollectionRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchCollectionRules(collection)
      .then(setRules)
      .catch((e) => toast.error(`Failed to load rules: ${(e as Error).message}`))
      .finally(() => setLoading(false));
  }, [collection]);

  const setRule = (key: keyof CollectionRules, value: string | null) => {
    setRules((r) => ({ ...r, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCollectionRules(collection, rules);
      toast.success("Rules saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <strong>Access Rules</strong> — Control who can perform each operation.{" "}
        <span className="font-mono text-xs">null</span> = admin only,{" "}
        <span className="font-mono text-xs">empty</span> = public,{" "}
        expression e.g. <span className="font-mono text-xs">@request.auth.id = user_id</span>
      </div>

      <div className="space-y-3">
        {RULE_FIELDS.map(({ key, label, description }) => {
          const rule = rules[key];
          const isLocked = rule === null;

          return (
            <div key={key} className="flex items-center gap-3">
              <div className="w-16 shrink-0">
                <span className="text-sm font-medium">{label}</span>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>

              <Button
                variant={isLocked ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 shrink-0"
                title={isLocked ? "Admin only (click to unlock)" : "Click to lock to admin only"}
                onClick={() => setRule(key, isLocked ? "" : null)}
              >
                {isLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              </Button>

              <Input
                className="h-8 font-mono text-sm"
                value={rule ?? ""}
                disabled={isLocked}
                placeholder={isLocked ? "Admin only" : "Empty = public, or expression (e.g. @request.auth.id = user_id)"}
                onChange={(e) => setRule(key, e.target.value)}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving && <Spinner className="mr-2" size="sm" />}
          {saving ? "Saving..." : "Save Rules"}
        </Button>
      </div>
    </div>
  );
}
