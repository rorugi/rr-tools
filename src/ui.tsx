import React from 'react';

/** Scoped styles survive the sandbox; RemNote's SDK supplies body.dark/body.light. */
export function ToolStyles() {
  return <style>{`
.rr-tools{--rr-bg:#fff;--rr-text:#24262b;--rr-muted:#737780;--rr-border:#e1e3e8;--rr-hover:#f4f5f7;--rr-accent:#6259d9;--rr-danger:#b42332;font:14px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--rr-text);background:var(--rr-bg);padding:20px;box-sizing:border-box}
.dark .rr-tools{--rr-bg:#202125;--rr-text:#e7e8ec;--rr-muted:#a1a4ad;--rr-border:#42444b;--rr-hover:#2e3036;--rr-accent:#8b80f9;--rr-danger:#ff99a5;color-scheme:dark}
.rr-tools *{box-sizing:border-box}.rr-tools h2{font-size:18px;font-weight:600;line-height:1.35;margin:0 0 8px}.rr-tools h3{font-size:14px;font-weight:600}.rr-tools p{margin:8px 0 14px}.rr-tools .rr-muted{color:var(--rr-muted);font-size:13px}
.rr-tools button,.rr-tools select,.rr-tools textarea{font:inherit;color:inherit;border:1px solid var(--rr-border);border-radius:6px;background:var(--rr-bg)}
.rr-tools button{position:relative;padding:7px 12px;min-height:34px;font-weight:500;cursor:pointer;line-height:18px}.rr-tools button:hover:enabled{background:var(--rr-hover)}
.rr-tools .rr-primary{color:#fff;background:var(--rr-accent);border-color:var(--rr-accent)}.rr-tools .rr-primary:hover:enabled{filter:brightness(.94);background:var(--rr-accent)}
/* Host button pseudo-elements must never intercept neighbouring controls. */
.rr-tools button::before,.rr-tools button::after{pointer-events:none}
.rr-tools button:disabled,.rr-tools select:disabled{opacity:.5;cursor:default}.rr-tools button:focus-visible,.rr-tools select:focus-visible,.rr-tools textarea:focus-visible{outline:2px solid var(--rr-accent);outline-offset:2px}
.rr-tools select{appearance:none;min-height:36px;padding:7px 32px 7px 10px;width:100%;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23858a94' stroke-width='1.5' d='m4 6 4 4 4-4'/%3E%3C/svg%3E");background-position:right 10px center;background-repeat:no-repeat}
.rr-tools .rr-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}.rr-tools label{font-size:13px;font-weight:500}.rr-tools label select{margin-top:6px;font-weight:400}.rr-tools .rr-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--rr-border);padding-top:16px;margin-top:20px}
.rr-tools [role=alert]{color:var(--rr-danger)}.rr-tools .rr-details{max-height:220px;overflow:auto;font-size:12px;padding:12px 12px 12px 28px;border:1px solid var(--rr-border);border-radius:6px;overflow-wrap:anywhere;white-space:pre-wrap}.rr-tools .rr-details li+li{margin-top:12px}
.rr-tools .rr-summary{padding:12px;background:var(--rr-hover);border-radius:6px}.rr-tools .rr-version{font-size:11px;color:var(--rr-muted);margin-top:14px}
/* Keep height independent of the sandbox iframe's initial zero height. The
   SDK measures this auto-height content; vh here would create a resize loop. */
.rr-tools.rr-paste-dialog{display:flex;flex-direction:column;max-height:480px;overflow:hidden}
.rr-paste-dialog>h2,.rr-paste-footer{flex:none}
.rr-paste-body{min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding-right:6px;overflow-wrap:anywhere}
.rr-paste-footer{background:var(--rr-bg)}
.rr-paste-footer .rr-actions{margin-top:12px;padding-top:12px;flex-wrap:wrap}
.rr-paste-footer .rr-version{margin-top:8px}
.rr-table-options{display:flex;gap:20px;flex-wrap:wrap;margin:0 0 10px}.rr-table-options label{display:flex;align-items:center;gap:6px;cursor:pointer}.rr-table-options input{accent-color:var(--rr-accent);width:16px;height:16px;margin:0}
.rr-paste-box{min-height:100px;max-height:150px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--rr-border);border-radius:6px;padding:10px;font-weight:400}
.rr-paste-box:focus{outline:2px solid var(--rr-accent);outline-offset:-2px}
.rr-paste-box[data-empty=true]::before{content:'Paste copied text here';color:var(--rr-muted);pointer-events:none}
.rr-paste-table{border-collapse:collapse;white-space:pre-wrap;min-width:100%;margin:0 0 8px}.rr-paste-table td,.rr-paste-table th{border:1px solid var(--rr-border);padding:6px 10px;vertical-align:top;text-align:left;min-width:100px}.rr-paste-table th{background:var(--rr-hover)}
.rr-paste-error{font-size:13px;max-height:80px;overflow:auto;overflow-wrap:anywhere;margin-bottom:0!important}
`}</style>;
}
