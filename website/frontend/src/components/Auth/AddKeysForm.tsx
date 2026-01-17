import { useState } from 'react';
import './AddKeysForm.css';

interface AddKeysFormProps {
  onSubmit: (pushKey: string, viewKey: string) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
}

function AddKeysForm({ onSubmit, onCancel }: AddKeysFormProps) {
  const [pushKey, setPushKey] = useState('');
  const [viewKey, setViewKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedPushKey = pushKey.trim();
    const trimmedViewKey = viewKey.trim();

    if (!trimmedPushKey || !trimmedViewKey) {
      setError('Both Push Key and View Key are required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await onSubmit(trimmedPushKey, trimmedViewKey);

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || 'Failed to add key pair');
    } else {
      // Clear form on success
      setPushKey('');
      setViewKey('');
      onCancel();
    }
  };

  return (
    <div className="add-keys-form-overlay" onClick={onCancel}>
      <div className="add-keys-form" onClick={(e) => e.stopPropagation()}>
        <div className="add-keys-form-header">
          <h3>Add Existing Key Pair</h3>
          <button className="add-keys-form-close" onClick={onCancel} title="Close">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="add-keys-form-field">
            <label htmlFor="pushKey">Push Key (Writer)</label>
            <input
              id="pushKey"
              type="text"
              value={pushKey}
              onChange={(e) => setPushKey(e.target.value)}
              placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000"
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className="add-keys-form-field">
            <label htmlFor="viewKey">View Key (Reader)</label>
            <input
              id="viewKey"
              type="text"
              value={viewKey}
              onChange={(e) => setViewKey(e.target.value)}
              placeholder="e.g., 550e8400-e29b-41d4-a716-446655440001"
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <div className="add-keys-form-error">
              {error}
            </div>
          )}

          <div className="add-keys-form-hint">
            Enter both keys to verify ownership. Once added, the key pair will be permanently saved to your account.
          </div>

          <div className="add-keys-form-actions">
            <button type="button" className="add-keys-cancel-btn" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="add-keys-submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Key Pair'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddKeysForm;
