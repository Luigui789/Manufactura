import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROLE_CODES, ROLE_LABELS } from '@/features/auth/types';

export function RoleSelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="role">Rol</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id="role"
          className="w-full"
          aria-invalid={!!error}
          aria-describedby={error ? 'role-error' : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_CODES.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p id="role-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
