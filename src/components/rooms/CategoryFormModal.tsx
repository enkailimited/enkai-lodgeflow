import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { RoomCategory, RoomCategoryInput } from '../../types/room';
import { findDuplicateCategoryName, isBlank } from '../../data/roomValidation';
import { RoomRepositoryError } from '../../data/roomRepository';
import { Button } from '../ui/Button';
import { FormField, Input, Textarea } from '../ui/FormControls';
import { Modal } from '../ui/Modal';

export interface CategoryFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  category: RoomCategory | null;
  categories: RoomCategory[];
  roomCount: number;
  onClose: () => void;
  onSubmit: (input: RoomCategoryInput) => Promise<void>;
}

export const CategoryFormModal: React.FC<CategoryFormModalProps> = ({
  isOpen,
  mode,
  category,
  categories,
  roomCount,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(category?.name ?? '');
      setDescription(category?.description ?? '');
      setErrors({});
      setSaving(false);
    }
  }, [isOpen, category]);

  const handleSubmit = async () => {
    const nextErrors: { name?: string; form?: string } = {};
    if (isBlank(name)) {
      nextErrors.name = 'Category name is required.';
    } else if (findDuplicateCategoryName(name, categories, category?.id)) {
      nextErrors.name = `A category named "${name.trim()}" already exists.`;
    }

    if (nextErrors.name) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      await onSubmit({ name, description });
      onClose();
    } catch (error) {
      if (error instanceof RoomRepositoryError) {
        setErrors({ name: error.message });
      } else {
        setErrors({
          form: error instanceof Error ? error.message : 'Could not save this category.',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={mode === 'create' ? 'Add Room Category' : `Edit Category — ${category?.name ?? ''}`}
      description="Categories group similar rooms and can be extended at any time."
      size="sm"
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            loading={saving}
            loadingText="Saving…"
          >
            {mode === 'create' ? 'Add Category' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        {errors.form && (
          <div
            role="alert"
            className="flex items-start gap-2 p-3 rounded-xl bg-[#FEF2F2] border border-[#EF4444]/30"
          >
            <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-[#152B4A]">{errors.form}</p>
          </div>
        )}

        <FormField label="Category name" htmlFor="category-name" required error={errors.name}>
          <Input
            id="category-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="e.g. Deluxe"
            autoFocus
            error={errors.name}
            maxLength={40}
          />
        </FormField>

        <FormField
          label="Description"
          htmlFor="category-description"
          hint="Optional. Explains what this category offers."
        >
          <Textarea
            id="category-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. Larger rooms with upgraded furnishings."
            maxLength={240}
          />
        </FormField>

        {mode === 'edit' && (
          <p className="text-[11px] text-[#718096]">
            {roomCount} {roomCount === 1 ? 'room uses' : 'rooms use'} this category.
            Renaming it updates the label shown on those rooms.
          </p>
        )}

        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
};
