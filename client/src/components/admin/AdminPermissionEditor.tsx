import { ADMIN_PERMISSION_SECTIONS, type AdminPermissionKey, type AdminPermissions } from "@shared/admin-permissions";

type AdminPermissionEditorProps = {
  idPrefix: string;
  value: AdminPermissions;
  onChange: (value: AdminPermissions) => void;
  disabled?: boolean;
};

export default function AdminPermissionEditor({ idPrefix, value, onChange, disabled = false }: AdminPermissionEditorProps) {
  function setPermission(key: AdminPermissionKey, checked: boolean) {
    onChange({ ...value, [key]: checked });
  }

  return <fieldset className="admin-permission-editor" disabled={disabled}>
    <legend>دسترسی‌های این مدیر</legend>
    <p>مجوزها جداگانه هستند؛ بخش «مدیران» و تغییر حساب مالک فقط در اختیار مالک سایت می‌ماند.</p>
    <div className="admin-permission-grid">
      {ADMIN_PERMISSION_SECTIONS.map(section => {
        const id = `${idPrefix}-${section.key}`;
        return <label className="admin-permission-option" htmlFor={id} key={section.key}>
          <input id={id} type="checkbox" checked={value[section.key]} onChange={event => setPermission(section.key, event.target.checked)} />
          <span><strong>{section.label}</strong><small>{section.description}</small></span>
        </label>;
      })}
    </div>
  </fieldset>;
}
