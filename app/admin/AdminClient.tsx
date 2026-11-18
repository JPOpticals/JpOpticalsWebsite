"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ADMIN_RESOURCES,
  ADMIN_RESOURCE_KEYS,
  formFields,
  tableColumns,
  type AdminField,
  type AdminResource,
  type AdminResourceKey,
} from "../../lib/admin-config";

type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  role: "customer" | "admin";
};

type AdminRecord = Record<string, any>;

type ListResponse = {
  records: AdminRecord[];
  page: number;
  limit: number;
  count: number;
  totalPages: number;
};

type StatsResponse = {
  stats: {
    revenue: number;
    orders: number;
    products: number;
    categories: number;
    customers: number;
    pendingOrders: number;
    pendingReviews: number;
    newInquiries: number;
  };
  sales: { date: string; revenue: number; orders: number }[];
  recentOrders: AdminRecord[];
  recentReviews: AdminRecord[];
  recentInquiries: AdminRecord[];
  activity: { type: string; title: string; detail: string; status: string; at: string }[];
};

type SectionKey = "dashboard" | AdminResourceKey;

type Health = { supabaseConfigured: boolean; imagekitConfigured: boolean };
type Setup = { configured: boolean; needsSetup: boolean; adminCount: number };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

const money = (value: unknown, currency = "USD") => {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
};

const shortDate = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const dateTime = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const toDateTimeInput = (value: unknown) => {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

const statusClass = (value: unknown) => {
  const status = text(value).toLowerCase();
  if (["approved", "paid", "delivered", "active", "fulfilled", "confirmed"].includes(status)) {
    return "jp-admin__pill is-good";
  }
  if (["pending", "unpaid", "processing", "new", "open"].includes(status)) {
    return "jp-admin__pill is-warn";
  }
  if (["rejected", "cancelled", "refunded", "spam", "failed", "archived"].includes(status)) {
    return "jp-admin__pill is-bad";
  }
  return "jp-admin__pill";
};

const sectionLabel = (key: SectionKey) =>
  key === "dashboard" ? "Dashboard" : ADMIN_RESOURCES[key].label;

type AdminIconName =
  | "close"
  | "edit"
  | "external"
  | "image"
  | "logout"
  | "plus"
  | "refresh"
  | "search"
  | "star"
  | "trash"
  | "upload"
  | "layers";

function AdminIcon({ name, size = 16 }: { name: AdminIconName; size?: number }) {
  const icon = (() => {
    switch (name) {
      case "close":
        return <path d="m6 6 12 12M18 6 6 18" />;
      case "edit":
        return <><path d="m4 16.5-.8 3.3 3.3-.8L18 7.5 15.5 5z" /><path d="m14 6.5 3.5 3.5" /></>;
      case "external":
        return <><path d="M14 5h5v5M19 5l-8 8" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>;
      case "image":
        return <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m3 16 5-5 3.5 3.5 2.5-2.5 7 7" /></>;
      case "logout":
        return <><path d="M14 8l4 4-4 4M18 12H5" /><path d="M9 5H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4" /></>;
      case "plus":
        return <path d="M12 5v14M5 12h14" />;
      case "refresh":
        return <><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></>;
      case "search":
        return <><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.5 4.5" /></>;
      case "star":
        return <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z" />;
      case "trash":
        return <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>;
      case "upload":
        return <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 14v5h14v-5" /></>;
      case "layers":
        return <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>;
    }
  })();

  return (
    <svg
      className="jp-admin__icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icon}
    </svg>
  );
}

function AdminTableWrap({ children }: { children: React.ReactNode }) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startScrollLeft: 0 });

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="jp-admin__table-wrap"
      ref={tableRef}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
        const table = tableRef.current;
        if (!table || table.scrollWidth <= table.clientWidth) return;
        dragRef.current = { active: true, moved: false, startX: event.clientX, startScrollLeft: table.scrollLeft };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.classList.add("is-dragging");
      }}
      onPointerMove={(event) => {
        if (!dragRef.current.active || !tableRef.current) return;
        const distance = event.clientX - dragRef.current.startX;
        if (Math.abs(distance) < 4) return;
        dragRef.current.moved = true;
        tableRef.current.scrollLeft = dragRef.current.startScrollLeft - distance;
        event.preventDefault();
      }}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onClick={(event) => {
        if (!dragRef.current.moved) return;
        event.preventDefault();
        event.stopPropagation();
        dragRef.current.moved = false;
      }}
      onWheel={(event) => {
        const table = tableRef.current;
        if (!table || table.scrollWidth <= table.clientWidth) return;
        const distance = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        if (!distance) return;
        table.scrollLeft += distance;
        event.preventDefault();
      }}
    >
      {children}
    </div>
  );
}

const styles = `
  .jp-admin { min-height:100vh; background:#f4f1ea; color:#1a1814; font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif; }
  .jp-admin *, .jp-admin *::before, .jp-admin *::after { box-sizing:border-box; }
  .jp-admin a { color:inherit; }
  .jp-admin__shell { display:grid; grid-template-columns:248px minmax(0,1fr); min-height:100vh; }
  .jp-admin__sidebar { background:#191713; color:#f6f1e7; padding:26px 18px; display:flex; flex-direction:column; gap:22px; position:sticky; top:0; height:100vh; overflow:auto; }
  .jp-admin__brand { font-family:Georgia,"Times New Roman",serif; font-size:25px; letter-spacing:.18em; }
  .jp-admin__eyebrow { margin:0; font-size:10px; letter-spacing:.3em; text-transform:uppercase; color:#a69b8a; }
  .jp-admin__sidebar .jp-admin__eyebrow { color:#8e8373; }
  .jp-admin__muted { color:#6e675c; font-size:13px; line-height:1.6; }
  .jp-admin__sidebar .jp-admin__muted { color:#a69b8a; }
  .jp-admin__nav { display:flex; flex-direction:column; gap:4px; }
  .jp-admin__nav-item { display:flex; align-items:center; gap:10px; border:0; border-radius:10px; background:transparent; color:#cfc6b8; padding:10px 11px; font:inherit; font-size:13px; text-align:left; cursor:pointer; }
  .jp-admin__nav-item:hover { background:rgba(255,255,255,.06); color:#fff; }
  .jp-admin__nav-item[aria-current="page"] { background:#f6f1e7; color:#191713; }
  .jp-admin__nav-mark { width:24px; height:24px; border-radius:7px; display:grid; place-items:center; font-size:9px; letter-spacing:.06em; background:rgba(255,255,255,.1); color:inherit; flex:none; }
  .jp-admin__nav-item[aria-current="page"] .jp-admin__nav-mark { background:#191713; color:#f6f1e7; }
  .jp-admin__nav-count { margin-left:auto; font-size:10px; opacity:.7; }
  .jp-admin__main { padding:30px clamp(18px,3vw,42px) 70px; min-width:0; }
  .jp-admin__top { display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between; border-bottom:1px solid #ddd5c8; padding-bottom:18px; margin-bottom:22px; }
  .jp-admin__top h1 { margin:4px 0 0; font-family:Georgia,"Times New Roman",serif; font-size:30px; font-weight:400; }
  .jp-admin__top-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .jp-admin__btn { appearance:none; border:1px solid #1a1814; background:#1a1814; color:#fff; border-radius:999px; padding:9px 16px; font-size:11px; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; font:inherit; font-size:11px; }
  .jp-admin__btn[disabled] { opacity:.45; cursor:not-allowed; }
  .jp-admin__btn--ghost { background:transparent; color:#1a1814; }
  .jp-admin__btn--danger { border-color:#8d2b23; background:#8d2b23; }
  .jp-admin__btn--small { padding:6px 10px; font-size:9px; letter-spacing:.08em; }
  .jp-admin__card { background:#fff; border:1px solid #e1d9cc; border-radius:16px; padding:20px; box-shadow:0 16px 42px rgba(38,31,20,.05); }
  .jp-admin__login { max-width:430px; margin:10vh auto 0; }
  .jp-admin__login h1 { font-family:Georgia,"Times New Roman",serif; font-size:31px; margin:9px 0 0; font-weight:400; }
  .jp-admin__field { display:flex; flex-direction:column; gap:6px; margin-top:14px; min-width:0; }
  .jp-admin__field label, .jp-admin__label { font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:#6e675c; }
  .jp-admin__field input, .jp-admin__field select, .jp-admin__field textarea, .jp-admin__input { width:100%; border:1px solid #d8d0c2; border-radius:9px; background:#fbf9f5; padding:10px 12px; font-size:13px; color:#1a1814; font:inherit; }
  .jp-admin__field input:focus, .jp-admin__field select:focus, .jp-admin__field textarea:focus, .jp-admin__input:focus { outline:2px solid #1a1814; outline-offset:1px; }
  .jp-admin__field textarea { resize:vertical; }
  .jp-admin__check { display:flex; align-items:center; gap:8px; margin-top:16px; font-size:13px; }
  .jp-admin__check input { width:16px; height:16px; accent-color:#1a1814; }
  .jp-admin__error { margin-top:12px; padding:10px 13px; border-radius:9px; background:#fbe9e7; color:#8d2b23; font-size:13px; }
  .jp-admin__notice { margin-top:12px; padding:10px 13px; border-radius:9px; background:#ecf3e8; color:#2f5825; font-size:13px; }
  .jp-admin__banner { margin:0 0 18px; padding:12px 15px; border-radius:11px; border:1px solid #e7d8a9; background:#fdf6df; color:#6b5416; font-size:13px; line-height:1.5; }
  .jp-admin__stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
  .jp-admin__stat { background:#fff; border:1px solid #e1d9cc; border-radius:14px; padding:16px 17px; }
  .jp-admin__stat span { display:block; font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:#7b7366; }
  .jp-admin__stat strong { display:block; margin-top:8px; font-family:Georgia,"Times New Roman",serif; font-size:26px; font-weight:400; line-height:1.1; }
  .jp-admin__stat small { display:block; margin-top:5px; font-size:11px; color:#8a8175; }
  .jp-admin__dash { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(280px,1fr); gap:16px; margin-top:16px; }
  .jp-admin__panel-title { margin:0; font-family:Georgia,"Times New Roman",serif; font-size:20px; font-weight:400; }
  .jp-admin__panel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; }
  .jp-admin__chart { display:flex; align-items:flex-end; gap:6px; height:190px; padding-top:10px; }
  .jp-admin__bar { flex:1; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; gap:5px; min-width:0; }
  .jp-admin__bar i { display:block; width:100%; max-width:26px; border-radius:5px 5px 2px 2px; background:#1a1814; min-height:2px; transition:height .35s ease; }
  .jp-admin__bar small { font-size:8px; color:#8a8175; white-space:nowrap; transform:rotate(-45deg); transform-origin:center; }
  .jp-admin__activity { display:flex; flex-direction:column; gap:11px; max-height:300px; overflow:auto; }
  .jp-admin__activity-item { display:flex; gap:10px; align-items:flex-start; border-bottom:1px solid #efe9de; padding-bottom:10px; }
  .jp-admin__activity-item:last-child { border-bottom:0; padding-bottom:0; }
  .jp-admin__dot { width:7px; height:7px; border-radius:999px; background:#1a1814; margin-top:5px; flex:none; }
  .jp-admin__activity-item strong { display:block; font-size:12px; font-weight:600; }
  .jp-admin__activity-item span { display:block; margin-top:2px; font-size:11px; color:#8a8175; }
  .jp-admin__toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:14px; }
  .jp-admin__toolbar .jp-admin__input { max-width:250px; }
  .jp-admin__toolbar select.jp-admin__input { max-width:170px; }
  .jp-admin__table-wrap { overflow:auto; border:1px solid #e1d9cc; border-radius:13px; background:#fff; cursor:grab; }
  .jp-admin__table-wrap.is-dragging { cursor:grabbing; user-select:none; }
  .jp-admin__table { width:100%; border-collapse:collapse; min-width:760px; }
  .jp-admin__table th { text-align:left; font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:#7b7366; background:#faf7f1; padding:11px 12px; border-bottom:1px solid #e7dfd3; white-space:nowrap; cursor:pointer; }
  .jp-admin__table th:hover { color:#1a1814; }
  .jp-admin__table th.is-static { cursor:default; }
  .jp-admin__table td { padding:10px 12px; border-bottom:1px solid #f0eadf; font-size:12px; vertical-align:middle; }
  .jp-admin__table tr:last-child td { border-bottom:0; }
  .jp-admin__table tr:hover td { background:#fcfaf6; }
  .jp-admin__cell-img { width:34px; height:34px; border-radius:7px; object-fit:cover; background:#eee7da; display:block; }
  .jp-admin__cell-strong { font-weight:600; }
  .jp-admin__cell-sub { display:block; margin-top:2px; color:#8a8175; font-size:10px; }
  .jp-admin__pill { display:inline-flex; align-items:center; border-radius:999px; padding:3px 8px; background:#eee9df; color:#5e584e; font-size:9px; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; }
  .jp-admin__pill.is-good { background:#e6f1df; color:#36622a; }
  .jp-admin__pill.is-warn { background:#fbf1d5; color:#6f5614; }
  .jp-admin__pill.is-bad { background:#f8e3e0; color:#842b22; }
  .jp-admin__row-actions { display:flex; gap:5px; flex-wrap:wrap; }
  .jp-admin__empty { padding:42px 20px; text-align:center; color:#7b7366; font-size:13px; }
  .jp-admin__pager { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:12px; font-size:11px; color:#7b7366; }
  .jp-admin__overlay { position:fixed; inset:0; z-index:40; background:rgba(20,17,13,.45); display:flex; align-items:flex-start; justify-content:center; padding:32px 16px; overflow:auto; }
  .jp-admin__modal { width:min(860px,100%); background:#f7f3eb; border:1px solid #d8d0c2; border-radius:18px; box-shadow:0 30px 80px rgba(0,0,0,.28); padding:24px; }
  .jp-admin__modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:12px; }
  .jp-admin__modal-title { margin:3px 0 0; font-family:Georgia,"Times New Roman",serif; font-size:24px; font-weight:400; }
  .jp-admin__close { border:1px solid #cfc6b8; background:transparent; border-radius:999px; width:30px; height:30px; cursor:pointer; font-size:16px; line-height:1; color:#1a1814; }
  .jp-admin__form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 14px; }
  .jp-admin__field--full { grid-column:1 / -1; }
  .jp-admin__order-items { margin-top:22px; padding-top:18px; border-top:1px solid #e1d9cc; }
  .jp-admin__section-title { margin:0; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#7b7366; }
  .jp-admin__order-items-list { display:grid; gap:10px; margin-top:12px; }
  .jp-admin__order-item { padding:12px 14px; border:1px solid #e1d9cc; border-radius:10px; background:#fffdf9; }
  .jp-admin__order-item > div { display:flex; align-items:baseline; justify-content:space-between; gap:14px; }
  .jp-admin__order-item strong { font-size:12px; font-weight:600; }
  .jp-admin__order-item > div span { color:#7b7366; font-size:11px; white-space:nowrap; }
  .jp-admin__order-item p { display:grid; gap:3px; margin:9px 0 0; color:#403b34; font-size:12px; line-height:1.5; }
  .jp-admin__order-item p span { color:#a4763e; font-size:9px; letter-spacing:.12em; text-transform:uppercase; }
  .jp-admin__field-note { font-size:10px; color:#8a8175; }
  .jp-admin__image-row { display:flex; gap:12px; align-items:center; }
  .jp-admin__image-row img { width:74px; height:58px; object-fit:cover; border-radius:8px; background:#eee7da; border:1px solid #ddd5c8; flex:none; }
  .jp-admin__image-row .jp-admin__input { max-width:100%; }
  .jp-admin__modal-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; margin-top:22px; padding-top:16px; border-top:1px solid #e1d9cc; }
  .jp-admin__media { margin-top:22px; padding-top:18px; border-top:1px solid #e1d9cc; }
  .jp-admin__media-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(145px,1fr)); gap:12px; margin-top:14px; }
  .jp-admin__tile { border:1px solid #e1d9cc; border-radius:12px; overflow:hidden; background:#fff; display:flex; flex-direction:column; }
  .jp-admin__thumb { position:relative; aspect-ratio:4/3; background:#eee7da; }
  .jp-admin__thumb img { width:100%; height:100%; object-fit:cover; display:block; }
  .jp-admin__badge { position:absolute; top:7px; left:7px; background:#1a1814; color:#fff; border-radius:999px; padding:3px 7px; font-size:8px; letter-spacing:.12em; text-transform:uppercase; }
  .jp-admin__tile-body { padding:9px 10px 11px; display:flex; flex-direction:column; gap:7px; }
  .jp-admin__tile-meta { margin:0; font-size:10px; color:#7b7366; line-height:1.45; word-break:break-word; }
  .jp-admin__actions { display:flex; flex-wrap:wrap; gap:4px; }
  .jp-admin__drop { margin-top:14px; border:1.5px dashed #c9bfae; border-radius:12px; padding:18px; text-align:center; background:#fbf9f5; cursor:pointer; display:block; }
  .jp-admin__drop.is-active { border-color:#1a1814; background:#f3efe7; }
  .jp-admin__pending { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  .jp-admin__pending-item { position:relative; width:68px; height:68px; border-radius:8px; overflow:hidden; border:1px solid #ddd5c8; }
  .jp-admin__pending-item img { width:100%; height:100%; object-fit:cover; }
  .jp-admin__pending-item button { position:absolute; top:2px; right:2px; border:0; border-radius:999px; width:18px; height:18px; cursor:pointer; background:rgba(20,18,14,.75); color:#fff; }
  .jp-admin__loading { padding:28px; text-align:center; color:#7b7366; font-size:12px; }
  .jp-admin__toast { position:fixed; right:20px; bottom:20px; z-index:60; background:#1a1814; color:#fff; padding:12px 17px; border-radius:11px; font-size:12px; box-shadow:0 16px 40px rgba(0,0,0,.25); }
  @media (max-width:1050px) { .jp-admin__stats { grid-template-columns:repeat(2,minmax(0,1fr)); } .jp-admin__dash { grid-template-columns:1fr; } }
  @media (max-width:820px) {
    .jp-admin__shell { grid-template-columns:1fr; }
    .jp-admin__sidebar { position:static; height:auto; padding:18px; }
    .jp-admin__nav { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .jp-admin__main { padding:22px 14px 60px; }
    .jp-admin__form-grid { grid-template-columns:1fr; }
    .jp-admin__modal { padding:18px; }
  }
  @media (max-width:520px) { .jp-admin__stats { grid-template-columns:1fr; } .jp-admin__nav { grid-template-columns:1fr; } .jp-admin__toolbar .jp-admin__input { max-width:none; } }

  /* Refined admin system: JP ivory, ink and brass, shared across every section. */
  body:has(.jp-admin) { margin:0; background:#f4f1ea; }
  .jp-admin {
    --admin-ink:#1a1815;
    --admin-ink-soft:#403b34;
    --admin-muted:#746d62;
    --admin-faint:#9a9184;
    --admin-canvas:#f4f1ea;
    --admin-surface:#fffdf9;
    --admin-surface-soft:#faf7f1;
    --admin-line:#ded6c9;
    --admin-line-soft:#eee8dd;
    --admin-brass:#a4763e;
    --admin-brass-soft:#f1e7d7;
    --admin-success:#2f633d;
    --admin-success-bg:#e8f1e5;
    --admin-warning:#805c1e;
    --admin-warning-bg:#f8efd9;
    --admin-danger:#99342b;
    --admin-danger-bg:#f8e6e2;
    background:var(--admin-canvas);
    color:var(--admin-ink);
    font-family:var(--font-nav,"Trebuchet MS"),var(--font-work-sans,"Segoe UI"),sans-serif;
    font-size:14px;
    line-height:1.45;
    -webkit-font-smoothing:antialiased;
    text-rendering:optimizeLegibility;
  }
  .jp-admin ::selection { background:#d8c29f; color:var(--admin-ink); }
  .jp-admin button, .jp-admin input, .jp-admin select, .jp-admin textarea { font:inherit; }
  .jp-admin button, .jp-admin select, .jp-admin input[type="checkbox"] { cursor:pointer; }
  .jp-admin button:focus-visible, .jp-admin input:focus-visible, .jp-admin select:focus-visible, .jp-admin textarea:focus-visible, .jp-admin label:has(input:focus-visible) {
    outline:2px solid var(--admin-brass);
    outline-offset:3px;
  }
  .jp-admin__shell { grid-template-columns:272px minmax(0,1fr); }
  .jp-admin__sidebar {
    position:sticky;
    top:0;
    z-index:10;
    padding:34px 20px 22px;
    gap:28px;
    background:#191815;
    border-right:1px solid #2f2b25;
  }
  .jp-admin__brand { margin-top:4px; color:#fbf7ef; font-size:28px; letter-spacing:.2em; line-height:1; }
  .jp-admin__sidebar .jp-admin__eyebrow { color:#a89b87; }
  .jp-admin__eyebrow { color:#8b7b66; font-size:10px; font-weight:600; letter-spacing:.28em; line-height:1.2; }
  .jp-admin__muted { color:var(--admin-muted); font-size:12px; line-height:1.55; }
  .jp-admin__sidebar .jp-admin__muted { color:#b6ab9a; }
  .jp-admin__nav { gap:5px; }
  .jp-admin__nav-item {
    min-height:42px;
    padding:9px 11px;
    border:1px solid transparent;
    border-radius:10px;
    color:#cfc5b7;
    font-size:13px;
    letter-spacing:.01em;
    transition:background-color 180ms ease,color 180ms ease,border-color 180ms ease,transform 180ms ease;
  }
  .jp-admin__nav-item:hover { background:#292620; color:#fffaf1; transform:translateX(2px); }
  .jp-admin__nav-item[aria-current="page"] { background:#f7f2e9; color:#1b1916; border-color:#f7f2e9; box-shadow:0 8px 18px rgba(0,0,0,.14); }
  .jp-admin__nav-mark { width:25px; height:25px; border-radius:8px; background:#302e29; color:#c8bdaf; font-size:9px; font-weight:600; }
  .jp-admin__nav-item[aria-current="page"] .jp-admin__nav-mark { background:#1b1916; color:#f7f2e9; }
  .jp-admin__nav-count { min-width:20px; height:20px; padding:0 5px; border-radius:999px; background:#37322b; color:#e7ddcd; display:inline-grid; place-items:center; font-size:10px; font-variant-numeric:tabular-nums; }
  .jp-admin__nav-item[aria-current="page"] .jp-admin__nav-count { background:#e5d6bd; color:#5e4528; }
  .jp-admin__sidebar > div:last-child { padding-top:20px; border-top:1px solid #373129; }
  .jp-admin__sidebar .jp-admin__btn--ghost { border-color:#625848 !important; color:#f7f2e9 !important; }
  .jp-admin__main { padding:clamp(28px,4vw,52px) clamp(18px,4vw,58px) 76px; }
  .jp-admin__top { min-height:86px; margin-bottom:28px; padding-bottom:22px; border-bottom-color:var(--admin-line); }
  .jp-admin__top h1 { margin-top:7px; color:var(--admin-ink); font-size:clamp(31px,3vw,42px); letter-spacing:-.025em; line-height:1.05; }
  .jp-admin__top-actions { gap:9px; }
  .jp-admin__btn {
    min-height:40px;
    padding:10px 17px;
    border:1px solid var(--admin-ink);
    border-radius:10px;
    background:var(--admin-ink);
    color:#fffdf9;
    font-size:10px;
    font-weight:600;
    letter-spacing:.13em;
    line-height:1;
    transition:background-color 180ms ease,border-color 180ms ease,color 180ms ease,box-shadow 180ms ease,transform 180ms ease;
  }
  .jp-admin__btn:hover:not([disabled]) { background:#39342e; border-color:#39342e; box-shadow:0 6px 16px rgba(24,21,17,.14); transform:translateY(-1px); }
  .jp-admin__btn:active:not([disabled]) { box-shadow:none; transform:translateY(0); }
  .jp-admin__btn--ghost { background:transparent; color:var(--admin-ink); }
  .jp-admin__btn--ghost:hover:not([disabled]) { background:var(--admin-surface-soft); border-color:#8e8373; color:var(--admin-ink); }
  .jp-admin__btn--danger { border-color:var(--admin-danger); background:var(--admin-danger); }
  .jp-admin__btn--danger:hover:not([disabled]) { background:#7f2923; border-color:#7f2923; }
  .jp-admin__btn--small { min-height:34px; padding:8px 11px; border-radius:8px; font-size:9px; letter-spacing:.09em; }
  .jp-admin__btn[disabled] { opacity:.42; filter:saturate(.5); }
  .jp-admin__card, .jp-admin__stat {
    border:1px solid var(--admin-line);
    border-radius:14px;
    background:var(--admin-surface);
    box-shadow:none;
  }
  .jp-admin__card { padding:22px; }
  .jp-admin__login {
    width:min(100% - 36px,460px);
    max-width:none;
    margin:clamp(44px,12vh,124px) auto 48px;
    padding:34px 36px 38px;
  }
  .jp-admin__login::before { content:"JP  /  CONTROL"; display:block; margin-bottom:23px; color:var(--admin-brass); font-size:10px; font-weight:600; letter-spacing:.25em; }
  .jp-admin__login > .jp-admin__eyebrow { display:none; }
  .jp-admin__login h1 { margin:0; font-size:clamp(32px,4vw,40px); letter-spacing:-.025em; line-height:1.05; }
  .jp-admin__login .jp-admin__muted { margin-top:12px !important; max-width:33ch; font-size:13px; }
  .jp-admin__login .jp-admin__btn { width:100%; margin-top:20px; }
  .jp-admin__field { gap:7px; margin-top:17px; }
  .jp-admin__field label, .jp-admin__label { color:#695f52; font-size:10px; font-weight:600; letter-spacing:.15em; }
  .jp-admin__field input, .jp-admin__field select, .jp-admin__field textarea, .jp-admin__input {
    min-height:44px;
    padding:10px 13px;
    border:1px solid #d3c9ba;
    border-radius:9px;
    background:#fffdfa;
    color:var(--admin-ink);
    font-size:13px;
    line-height:1.35;
    transition:border-color 180ms ease,box-shadow 180ms ease,background-color 180ms ease;
  }
  .jp-admin__field textarea { min-height:96px; }
  .jp-admin__field input::placeholder, .jp-admin__input::placeholder { color:#9b9185; }
  .jp-admin__field input:hover, .jp-admin__field select:hover, .jp-admin__field textarea:hover, .jp-admin__input:hover { border-color:#ae9f8c; }
  .jp-admin__field input:focus, .jp-admin__field select:focus, .jp-admin__field textarea:focus, .jp-admin__input:focus { outline:none; border-color:var(--admin-brass); box-shadow:0 0 0 3px rgba(164,118,62,.14); background:#fff; }
  .jp-admin__check { min-height:44px; margin-top:16px; color:var(--admin-ink-soft); }
  .jp-admin__check input { width:17px; height:17px; accent-color:var(--admin-ink); }
  .jp-admin__error, .jp-admin__notice, .jp-admin__banner { border-radius:10px; line-height:1.5; }
  .jp-admin__error { padding:12px 14px; background:var(--admin-danger-bg); color:var(--admin-danger); }
  .jp-admin__notice { padding:12px 14px; background:var(--admin-success-bg); color:var(--admin-success); }
  .jp-admin__banner { padding:13px 15px; border:1px solid #e2c997; background:#fbf3e2; color:#6e5226; }
  .jp-admin__stats { gap:14px; }
  .jp-admin__stat { min-height:128px; padding:19px 20px; transition:border-color 180ms ease,transform 180ms ease; }
  .jp-admin__stat:hover { border-color:#c1ad91; transform:translateY(-2px); }
  .jp-admin__stat span { color:#837868; font-weight:600; letter-spacing:.16em; }
  .jp-admin__stat strong { margin-top:12px; color:var(--admin-ink); font-size:30px; font-variant-numeric:tabular-nums; }
  .jp-admin__stat small { color:#867c6f; }
  .jp-admin__dash { gap:18px; margin-top:18px; }
  .jp-admin__panel-title { color:var(--admin-ink); font-size:22px; letter-spacing:-.015em; }
  .jp-admin__panel-head { margin-bottom:18px; }
  .jp-admin__chart { position:relative; height:214px; gap:8px; padding:20px 4px 10px; border-bottom:1px solid var(--admin-line); background:linear-gradient(to bottom,transparent 24.5%,#eee7dc 25%,transparent 25.5%,transparent 49.5%,#eee7dc 50%,transparent 50.5%,transparent 74.5%,#eee7dc 75%,transparent 75.5%); }
  .jp-admin__bar { gap:8px; }
  .jp-admin__bar i { max-width:30px; border-radius:5px 5px 2px 2px; background:var(--admin-ink); box-shadow:inset 0 2px 0 rgba(255,255,255,.16); }
  .jp-admin__bar small { color:#8b8174; font-variant-numeric:tabular-nums; }
  .jp-admin__activity { gap:0; max-height:324px; }
  .jp-admin__activity-item { gap:11px; padding:13px 0; border-bottom-color:var(--admin-line-soft); }
  .jp-admin__activity-item:first-child { padding-top:2px; }
  .jp-admin__activity-item strong { color:var(--admin-ink-soft); font-size:12px; }
  .jp-admin__activity-item span { color:#8a8072; }
  .jp-admin__dot { width:8px; height:8px; margin-top:6px; background:var(--admin-brass); box-shadow:0 0 0 4px var(--admin-brass-soft); }
  .jp-admin__toolbar { gap:9px; margin-bottom:16px; padding:10px; border:1px solid var(--admin-line); border-radius:12px; background:rgba(255,253,249,.6); }
  .jp-admin__toolbar .jp-admin__input { max-width:280px; }
  .jp-admin__toolbar select.jp-admin__input { max-width:190px; }
  .jp-admin__table-wrap { overflow:auto; border:1px solid var(--admin-line); border-radius:13px; background:var(--admin-surface); scrollbar-color:#b8aa98 #f7f2e9; scrollbar-width:thin; overscroll-behavior-x:contain; }
  .jp-admin__table { min-width:880px; border-collapse:separate; border-spacing:0; font-variant-numeric:tabular-nums; }
  .jp-admin__table th { position:sticky; top:0; z-index:1; padding:13px 14px; border-bottom:1px solid var(--admin-line); background:#fbf8f2; color:#766c5e; font-weight:600; letter-spacing:.13em; }
  .jp-admin__table th:hover { color:var(--admin-ink); background:#f7f1e7; }
  .jp-admin__table td { padding:14px; border-bottom:1px solid var(--admin-line-soft); color:#3d3831; line-height:1.4; }
  .jp-admin__table tbody tr { transition:background-color 150ms ease; }
  .jp-admin__table tbody tr:hover td { background:#fdfaf4; }
  .jp-admin__table th:last-child, .jp-admin__table td:last-child { position:sticky; right:0; z-index:2; box-shadow:-9px 0 14px rgba(49,40,29,.06); }
  .jp-admin__table th:last-child { background:#fbf8f2; }
  .jp-admin__table td:last-child { background:var(--admin-surface); }
  .jp-admin__table tbody tr:hover td:last-child { background:#fdfaf4; }
  .jp-admin__cell-img { width:40px; height:40px; border:1px solid var(--admin-line); border-radius:8px; background:#f2ece2; }
  .jp-admin__cell-strong { color:var(--admin-ink); font-weight:600; }
  .jp-admin__cell-sub { color:#8c8172; }
  .jp-admin__pill { min-height:24px; padding:4px 9px; background:#eee9df; color:#5f5649; font-size:9px; font-weight:600; letter-spacing:.09em; }
  .jp-admin__pill.is-good { background:var(--admin-success-bg); color:var(--admin-success); }
  .jp-admin__pill.is-warn { background:var(--admin-warning-bg); color:var(--admin-warning); }
  .jp-admin__pill.is-bad { background:var(--admin-danger-bg); color:var(--admin-danger); }
  .jp-admin__row-actions { gap:6px; }
  .jp-admin__empty { min-height:164px; display:grid; place-items:center; padding:34px 20px; border:1px dashed #cfc3b2; border-radius:12px; background:rgba(255,253,249,.5); color:#776d60; }
  .jp-admin__loading { min-height:120px; display:grid; place-items:center; padding:28px; border:1px dashed #cfc3b2; border-radius:12px; color:#776d60; }
  .jp-admin__pager { margin-top:15px; color:#766c5e; font-variant-numeric:tabular-nums; }
  .jp-admin__overlay { z-index:40; padding:clamp(14px,4vh,42px) 16px; background:rgba(18,16,13,.64); }
  .jp-admin__modal { width:min(920px,100%); max-height:calc(100dvh - 28px); overflow:auto; padding:28px; border:1px solid #d8cdbd; border-radius:16px; background:#fcfaf6; box-shadow:0 30px 80px rgba(0,0,0,.3); }
  .jp-admin__modal-head { margin-bottom:18px; padding-bottom:18px; border-bottom:1px solid var(--admin-line); }
  .jp-admin__modal-title { margin-top:5px; color:var(--admin-ink); font-size:28px; letter-spacing:-.02em; }
  .jp-admin__close { width:38px; height:38px; border-color:#cbbfae; background:#fffdf9; color:var(--admin-ink); transition:background-color 180ms ease,border-color 180ms ease,transform 180ms ease; }
  .jp-admin__close:hover { border-color:var(--admin-ink); background:#f4eee4; transform:rotate(4deg); }
  .jp-admin__form-grid { gap:0 18px; }
  .jp-admin__field-note { color:#887d6f; line-height:1.5; }
  .jp-admin__image-row img { width:82px; height:62px; border-color:var(--admin-line); border-radius:9px; }
  .jp-admin__modal-actions { margin-top:26px; padding-top:18px; border-top-color:var(--admin-line); }
  .jp-admin__media { border-top-color:var(--admin-line); }
  .jp-admin__tile { border-color:var(--admin-line); border-radius:11px; background:var(--admin-surface); }
  .jp-admin__thumb { background:#f1ebe1; }
  .jp-admin__badge { top:9px; left:9px; padding:4px 8px; background:var(--admin-ink); }
  .jp-admin__tile-body { padding:11px 12px 13px; }
  .jp-admin__tile-meta { color:#796f62; }
  .jp-admin__drop { min-height:108px; display:grid; place-items:center; margin-top:16px; border-color:#bcae9b; border-radius:11px; background:#fffdf9; color:#776d60; transition:background-color 180ms ease,border-color 180ms ease; }
  .jp-admin__drop:hover, .jp-admin__drop.is-active { border-color:var(--admin-brass); background:var(--admin-brass-soft); }
  .jp-admin__pending-item { border-color:var(--admin-line); border-radius:9px; }
  .jp-admin__pending-item button { min-width:24px; min-height:24px; top:4px; right:4px; }
  .jp-admin__toast { right:24px; bottom:24px; padding:13px 17px; border:1px solid #403a32; border-radius:10px; background:#1a1815; box-shadow:0 18px 42px rgba(0,0,0,.22); }
  @media (max-width:820px) {
    .jp-admin__sidebar { position:sticky; height:auto; padding:18px clamp(16px,3vw,28px) 12px; gap:16px; border-right:0; border-bottom:1px solid #373129; }
    .jp-admin__sidebar > div:first-child { display:flex; align-items:center; justify-content:space-between; gap:20px; }
    .jp-admin__brand { font-size:24px; }
    .jp-admin__nav { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; overflow:visible; padding-bottom:0; }
    .jp-admin__nav-item { width:100%; min-width:0; flex:none; min-height:44px; white-space:normal; }
    .jp-admin__nav-item:hover { transform:none; }
    .jp-admin__sidebar > div:last-child { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:0 !important; padding-top:13px; }
    .jp-admin__sidebar > div:last-child .jp-admin__muted { margin:0 !important; }
    .jp-admin__sidebar > div:last-child .jp-admin__btn { flex:0 0 auto; width:auto; }
    .jp-admin__main { padding:24px clamp(14px,3vw,28px) 60px; }
    .jp-admin__top { align-items:flex-start; }
    .jp-admin__form-grid { grid-template-columns:1fr; }
    .jp-admin__modal { padding:22px; }
  }
  @media (max-width:520px) {
    .jp-admin__sidebar > div:first-child { align-items:flex-start; }
    .jp-admin__sidebar > div:first-child .jp-admin__eyebrow { font-size:9px; }
    .jp-admin__brand { font-size:22px; }
    .jp-admin__main { padding:22px 12px 48px; }
    .jp-admin__top { display:block; min-height:0; margin-bottom:20px; padding-bottom:18px; }
    .jp-admin__top-actions { width:100%; margin-top:18px; }
    .jp-admin__top-actions .jp-admin__btn { flex:1 1 0; }
    .jp-admin__toolbar { display:grid; grid-template-columns:1fr; align-items:stretch; }
    .jp-admin__toolbar .jp-admin__input, .jp-admin__toolbar select.jp-admin__input { max-width:none; }
    .jp-admin__card { padding:18px; }
    .jp-admin__stat { min-height:112px; }
    .jp-admin__panel-title { font-size:20px; }
    .jp-admin__chart { height:185px; gap:4px; }
    .jp-admin__bar small { font-size:7px; }
    .jp-admin__modal { max-height:calc(100dvh - 24px); padding:18px; border-radius:14px; }
    .jp-admin__modal-title { font-size:25px; }
    .jp-admin__modal-actions { justify-content:stretch; }
    .jp-admin__modal-actions .jp-admin__btn { flex:1 1 0; }
    .jp-admin__image-row { align-items:flex-start; flex-wrap:wrap; }
    .jp-admin__pager { align-items:flex-start; flex-direction:column; }
    .jp-admin__toast { right:14px; bottom:14px; left:14px; text-align:center; }
  }
  @media (prefers-reduced-motion:reduce) {
    .jp-admin *, .jp-admin *::before, .jp-admin *::after { scroll-behavior:auto !important; animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
  }

  /* Readability and alignment pass for dense admin surfaces. */
  .jp-admin { font-size:15px; }
  .jp-admin__eyebrow { font-size:11px; letter-spacing:.22em; }
  .jp-admin__muted { font-size:13px; line-height:1.6; }
  .jp-admin__nav-item { font-size:14px; }
  .jp-admin__nav-mark { font-size:10px; line-height:1; }
  .jp-admin__nav-count { font-size:11px; }
  .jp-admin__top { align-items:flex-end; }
  .jp-admin__top-actions { align-items:center; }
  .jp-admin__btn {
    display:inline-flex;
    align-items:center;
    justify-content:center;
    height:42px;
    min-height:42px;
    padding-inline:18px;
    font-size:11px;
    white-space:nowrap;
  }
  .jp-admin__btn--small {
    height:36px;
    min-height:36px;
    min-width:74px;
    padding-inline:12px;
    font-size:10px;
    letter-spacing:.07em;
  }
  .jp-admin__card { padding:24px; }
  .jp-admin__login .jp-admin__muted { font-size:14px; }
  .jp-admin__field label, .jp-admin__label { font-size:11px; }
  .jp-admin__field input, .jp-admin__field select, .jp-admin__field textarea, .jp-admin__input { font-size:14px; }
  .jp-admin__check { font-size:14px; }
  .jp-admin__field-note { font-size:12px; }
  .jp-admin__stat span { font-size:11px; }
  .jp-admin__stat strong { font-size:32px; }
  .jp-admin__stat small { font-size:12px; }
  .jp-admin__panel-head { align-items:center; }
  .jp-admin__panel-title { font-size:23px; }
  .jp-admin__activity-item strong { font-size:14px; line-height:1.35; }
  .jp-admin__activity-item span { font-size:12px; }
  .jp-admin__row-actions { align-items:center; }
  .jp-admin__row-actions .jp-admin__btn { min-width:74px; }
  .jp-admin__table th { font-size:11px; line-height:1.35; }
  .jp-admin__table td { font-size:14px; line-height:1.5; }
  .jp-admin__cell-sub { font-size:12px; line-height:1.4; }
  .jp-admin__pill { min-height:26px; padding:5px 10px; font-size:10px; line-height:1; letter-spacing:.07em; }
  .jp-admin__empty, .jp-admin__loading { font-size:14px; }
  .jp-admin__pager { font-size:12px; }
  .jp-admin__modal-actions { align-items:center; }
  .jp-admin__modal-actions .jp-admin__btn { min-width:118px; }
  .jp-admin__close { display:inline-grid; place-items:center; flex:none; }
  .jp-admin__tile-meta { font-size:12px; }
  .jp-admin__drop { font-size:13px; }
  .jp-admin__toast { font-size:13px; }
  @media (max-width:820px) {
    .jp-admin__card { padding:20px; }
    .jp-admin__panel-head { align-items:flex-start; }
    .jp-admin__top h1 { font-size:clamp(32px,5vw,38px); }
  }
  @media (max-width:520px) {
    .jp-admin { font-size:14px; }
    .jp-admin__top h1 { font-size:32px; }
    .jp-admin__card { padding:18px; }
    .jp-admin__stat strong { font-size:29px; }
    .jp-admin__table th { font-size:10px; }
    .jp-admin__table td { font-size:13px; }
    .jp-admin__btn--small { height:38px; min-height:38px; min-width:72px; }
    .jp-admin__modal-actions .jp-admin__btn { min-width:0; }
  }
  @media (max-width:820px) {
    .jp-admin__shell { grid-template-columns:1fr; }
    .jp-admin__sidebar { position:static; }
    .jp-admin__nav {
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:6px;
      overflow:visible;
      padding-bottom:0;
    }
    .jp-admin__nav-item {
      width:100%;
      min-width:0;
      flex:none;
      white-space:normal;
    }
  }
  @media (max-width:600px) {
    .jp-admin__nav { grid-template-columns:1fr; }
  }
  .jp-admin__top-heading { display:flex; align-items:flex-start; gap:14px; min-width:0; }
  .jp-admin__menu-toggle, .jp-admin__drawer-backdrop { display:none; }
  @media (max-width:820px) {
    .jp-admin__shell { grid-template-columns:1fr; }
    .jp-admin__sidebar {
      position:fixed;
      inset:0 auto 0 0;
      z-index:60;
      width:min(304px,88vw);
      height:100dvh;
      max-height:100dvh;
      padding:24px 16px 20px;
      gap:22px;
      overflow-y:auto;
      overscroll-behavior:contain;
      border-right:1px solid #373129;
      border-bottom:0;
      transform:translateX(-105%);
      visibility:hidden;
      box-shadow:18px 0 44px rgba(0,0,0,.26);
      transition:transform 220ms cubic-bezier(.22,.61,.36,1),visibility 220ms ease;
    }
    .jp-admin__sidebar.is-open { transform:translateX(0); visibility:visible; }
    .jp-admin__sidebar > div:first-child {
      display:block;
      padding:2px 8px 16px;
      border-bottom:1px solid #373129;
    }
    .jp-admin__brand { font-size:26px; }
    .jp-admin__nav { display:flex; flex-direction:column; gap:5px; overflow:visible; padding-bottom:0; }
    .jp-admin__nav-item { width:100%; min-width:0; min-height:46px; flex:none; white-space:normal; }
    .jp-admin__nav-item:hover { transform:none; }
    .jp-admin__sidebar > div:last-child {
      display:block;
      margin-top:auto !important;
      padding:18px 8px 0;
      border-top:1px solid #373129;
    }
    .jp-admin__sidebar > div:last-child .jp-admin__muted { margin:0 0 14px !important; }
    .jp-admin__sidebar > div:last-child .jp-admin__btn { width:100%; }
    .jp-admin__drawer-backdrop {
      position:fixed;
      inset:0;
      z-index:50;
      width:100%;
      min-height:100%;
      margin:0;
      padding:0;
      border:0;
      border-radius:0;
      background:rgba(24,21,17,.58);
      opacity:0;
      visibility:hidden;
      pointer-events:none;
      cursor:default;
      transition:opacity 200ms ease,visibility 200ms ease;
    }
    .jp-admin__drawer-backdrop.is-open { opacity:1; visibility:visible; pointer-events:auto; }
    .jp-admin__menu-toggle {
      display:inline-flex;
      flex:0 0 auto;
      width:44px;
      height:44px;
      min-height:44px;
      margin-top:1px;
      padding:0;
      align-items:center;
      justify-content:center;
      flex-direction:column;
      gap:5px;
      border:1px solid var(--admin-line);
      border-radius:10px;
      background:var(--admin-surface);
      color:var(--admin-ink);
      cursor:pointer;
    }
    .jp-admin__menu-toggle span {
      display:block;
      width:18px;
      height:1.5px;
      border-radius:2px;
      background:currentColor;
      transition:transform 180ms ease,opacity 180ms ease;
    }
    .jp-admin__menu-toggle[aria-expanded="true"] span:first-child { transform:translateY(6.5px) rotate(45deg); }
    .jp-admin__menu-toggle[aria-expanded="true"] span:nth-child(2) { opacity:0; }
    .jp-admin__menu-toggle[aria-expanded="true"] span:last-child { transform:translateY(-6.5px) rotate(-45deg); }
    .jp-admin__top-heading { align-items:center; gap:12px; }
    .jp-admin__main { padding:24px clamp(14px,3vw,28px) 60px; }
  }
  @media (max-width:520px) {
    .jp-admin__main { padding:22px 12px 48px; }
    .jp-admin__top-heading { gap:10px; }
  }
  @media (prefers-reduced-motion:reduce) {
    .jp-admin__sidebar, .jp-admin__drawer-backdrop, .jp-admin__menu-toggle span { transition:none; }
  }
  .jp-admin__icon { display:block; flex:none; }
  .jp-admin__btn { height:38px; min-height:38px; padding-inline:14px; gap:7px; }
  .jp-admin__btn--small { height:32px; min-height:32px; min-width:0; padding-inline:10px; }
  .jp-admin__icon-btn {
    position:relative;
    width:40px;
    min-width:40px;
    height:40px;
    min-height:40px;
    padding:0;
    border-radius:10px;
    letter-spacing:0;
    border-color:#d3c6b5;
    background:#f8f4ed;
    color:var(--admin-ink-soft);
    box-shadow:0 1px 0 rgba(33,27,20,.05);
    transition:background-color 180ms ease,border-color 180ms ease,color 180ms ease,box-shadow 180ms ease,transform 180ms ease;
  }
  .jp-admin__btn--small.jp-admin__icon-btn {
    width:36px;
    min-width:36px;
    height:36px;
    min-height:36px;
    padding:0;
  }
  .jp-admin__icon-btn:not([disabled]):hover {
    border-color:#b99a70;
    background:var(--admin-brass-soft);
    color:var(--admin-ink);
    box-shadow:0 6px 14px rgba(61,45,28,.12);
    transform:translateY(-1px);
  }
  .jp-admin__icon-btn:not([disabled]):active { box-shadow:none; transform:translateY(0); }
  .jp-admin__icon-btn--primary { border-color:#d8bd94; background:var(--admin-brass-soft); color:#855f2d; }
  .jp-admin__icon-btn--primary:not([disabled]):hover { border-color:#a4763e; background:#e9d5b6; color:#6f4d24; }
  .jp-admin__btn--danger.jp-admin__icon-btn { border-color:#dfb3aa; background:var(--admin-danger-bg); color:var(--admin-danger); }
  .jp-admin__btn--danger.jp-admin__icon-btn:not([disabled]):hover { border-color:#c27d72; background:#f0d0ca; color:#7f2923; }
  .jp-admin__icon-btn[data-tooltip]::after {
    content:attr(data-tooltip);
    position:absolute;
    left:50%;
    bottom:calc(100% + 7px);
    z-index:20;
    max-width:180px;
    padding:5px 8px;
    border:1px solid #403a32;
    border-radius:6px;
    background:#1a1815;
    color:#fffdf9;
    font-size:10px;
    font-weight:500;
    letter-spacing:.02em;
    line-height:1.2;
    white-space:nowrap;
    pointer-events:none;
    opacity:0;
    transform:translate(-50%,4px);
    transition:opacity 150ms ease,transform 150ms ease;
  }
  .jp-admin__icon-btn[data-tooltip]:hover::after,
  .jp-admin__icon-btn[data-tooltip]:focus-visible::after { opacity:1; transform:translate(-50%,0); }
  .jp-admin__icon-btn--subtle {
    width:26px;
    min-width:26px;
    height:26px;
    min-height:26px;
    border:0;
    border-radius:7px;
    background:rgba(26,24,21,.72);
    color:#fffdf9;
    box-shadow:0 3px 8px rgba(0,0,0,.16);
    transition:background-color 160ms ease,transform 160ms ease,box-shadow 160ms ease;
  }
  .jp-admin__icon-btn--subtle:hover { background:#1a1815; box-shadow:0 5px 10px rgba(0,0,0,.22); transform:translateY(-1px); }
  .jp-admin__icon-btn--subtle:active { box-shadow:none; transform:translateY(0); }
  .jp-admin__sidebar .jp-admin__btn--signout {
    width:min(100%,150px);
    height:38px;
    min-height:38px;
    justify-content:center;
    gap:8px;
    padding:0 13px;
    border:1px solid #65594b !important;
    border-radius:10px;
    background:rgba(255,253,249,.03) !important;
    color:#f7f2e9 !important;
    font-size:10px;
    font-weight:600;
    letter-spacing:.13em;
    line-height:1;
    transition:background-color 180ms ease,border-color 180ms ease,color 180ms ease,box-shadow 180ms ease,transform 180ms ease;
  }
  .jp-admin__sidebar .jp-admin__btn--signout:hover:not([disabled]) {
    border-color:#f7f2e9 !important;
    background:#f7f2e9 !important;
    color:#191713 !important;
    box-shadow:0 7px 18px rgba(0,0,0,.22);
    transform:translateY(-1px);
  }
  .jp-admin__sidebar .jp-admin__btn--signout:active:not([disabled]) { box-shadow:none; transform:translateY(0); }
  .jp-admin__search { position:relative; display:flex; align-items:center; flex:1 1 280px; max-width:280px; min-width:0; }
  .jp-admin__search > .jp-admin__icon { position:absolute; left:12px; z-index:1; color:#887d6f; pointer-events:none; }
  .jp-admin__search .jp-admin__input { max-width:none; padding-left:38px; }
  .jp-admin__row-actions { gap:6px; }
  .jp-admin__row-actions .jp-admin__icon-btn { min-width:36px; }
  .jp-admin__close .jp-admin__icon { margin:auto; }
  @media (max-width:520px) {
    .jp-admin__btn { height:38px; min-height:38px; }
    .jp-admin__search { flex-basis:100%; max-width:none; }
    .jp-admin__toolbar .jp-admin__input { max-width:none; }
    .jp-admin__sidebar .jp-admin__btn--signout { width:100%; }
  }
  @media (hover:none) {
    .jp-admin__icon-btn[data-tooltip]::after { display:none; }
  }
  @media (pointer:coarse) {
    .jp-admin__icon-btn:not(.jp-admin__icon-btn--subtle) {
      width:44px;
      min-width:44px;
      height:44px;
      min-height:44px;
    }
  }
`;

function buildForm(resource: AdminResource, record?: AdminRecord) {
  const values: Record<string, any> = {};
  for (const field of resource.fields) {
    if (record) {
      values[field.name] = record[field.name] ?? "";
    } else {
      values[field.name] =
        field.defaultValue !== undefined
          ? field.defaultValue
          : field.type === "boolean"
            ? false
            : field.type === "json"
              ? ""
              : "";
    }
  }
  return values;
}

function cellValue(resource: AdminResource, field: AdminField, row: AdminRecord) {
  const value = row[field.name];
  if (field.type === "image" || /image_url|logo_url|hero_image_url/.test(field.name)) {
    return value ? (
      <img className="jp-admin__cell-img" src={String(value)} alt="" loading="lazy" />
    ) : (
      <span className="jp-admin__muted">None</span>
    );
  }
  if (field.type === "boolean") {
    return <span className={statusClass(value ? "active" : "draft")}>{value ? "Yes" : "No"}</span>;
  }
  if (field.type === "money") {
    return money(value, text(row.currency) || "USD");
  }
  if (field.type === "datetime" || field.type === "date") {
    return field.type === "date" ? shortDate(value) : dateTime(value);
  }
  if (field.type === "json") {
    if (!value) return <span className="jp-admin__muted">—</span>;
    return (
      <span className="jp-admin__muted">
        {JSON.stringify(value).slice(0, 54)}
        {JSON.stringify(value).length > 54 ? "…" : ""}
      </span>
    );
  }
  if (field.type === "select" || field.name === "status" || field.name === "role") {
    return <span className={statusClass(value)}>{text(value) || "—"}</span>;
  }
  if (field.name === "email") {
    return (
      <span>
        <span className="jp-admin__cell-strong">{text(value)}</span>
        {resource.key === "orders" && row.order_number ? (
          <span className="jp-admin__cell-sub">{text(row.order_number)}</span>
        ) : null}
      </span>
    );
  }
  if (field.name === "name" || field.name === "order_number" || field.name === "question") {
    return (
      <span>
        <span className="jp-admin__cell-strong">{text(value) || "—"}</span>
        {resource.key === "products" && row.brand ? (
          <span className="jp-admin__cell-sub">{text(row.brand)}</span>
        ) : null}
      </span>
    );
  }
  const output = Array.isArray(value) ? value.join(", ") : text(value);
  return output.length > 70 ? `${output.slice(0, 70)}…` : output || "—";
}

function ImageField({
  field,
  value,
  onChange,
  fileId,
}: {
  field: AdminField;
  value: string;
  onChange: (url: string) => void;
  fileId: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Images must be 10 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", field.uploadFolder || "jp/uploads");
      const data = await request<{ files: { url: string; fileId: string }[] }>(
        "/api/admin/upload",
        { method: "POST", body: form },
      );
      const uploaded = data.files?.[0];
      if (!uploaded) throw new Error("Upload returned no file.");
      onChange(uploaded.url);
      if (field.fileIdField) fileId(uploaded.fileId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="jp-admin__image-row">
        {value ? <img src={value} alt="" /> : <div className="jp-admin__cell-img" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            className="jp-admin__input"
            type="text"
            value={value}
            placeholder="https://…"
            onChange={(event) => onChange(event.target.value)}
          />
          <label
            className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small"
            style={{ display: "inline-block", marginTop: 7, cursor: "pointer" }}
          >
            {busy ? "Uploading…" : "Upload image"}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void upload(file);
              }}
            />
          </label>
        </div>
      </div>
      {error ? <p className="jp-admin__error">{error}</p> : null}
    </div>
  );
}

function FieldControl({
  field,
  value,
  record,
  form,
  setValue,
  categoryOptions,
  isEdit,
}: {
  field: AdminField;
  value: any;
  record: AdminRecord;
  form: Record<string, any>;
  setValue: (name: string, value: any) => void;
  categoryOptions: { value: string; label: string }[];
  isEdit: boolean;
}) {
  if (field.name === "password" && isEdit) return null;

  if (field.type === "boolean") {
    return (
      <label className="jp-admin__check jp-admin__field--full">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => setValue(field.name, event.target.checked)}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "image") {
    return (
      <div className="jp-admin__field jp-admin__field--full">
        <span className="jp-admin__label">{field.label}</span>
        <ImageField
          field={field}
          value={text(value)}
          onChange={(url) => setValue(field.name, url)}
          fileId={(id) => field.fileIdField && setValue(field.fileIdField, id)}
        />
        {field.help ? <span className="jp-admin__field-note">{field.help}</span> : null}
      </div>
    );
  }

  if (field.type === "json") {
    return (
      <div className="jp-admin__field jp-admin__field--full">
        <label htmlFor={`field-${field.name}`}>{field.label}</label>
        <textarea
          id={`field-${field.name}`}
          rows={field.rows || 4}
          value={
            typeof value === "string"
              ? value
              : value
                ? JSON.stringify(value, null, 2)
                : ""
          }
          onChange={(event) => setValue(field.name, event.target.value)}
          placeholder="{ }"
        />
        {field.help ? <span className="jp-admin__field-note">{field.help}</span> : null}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="jp-admin__field jp-admin__field--full">
        <label htmlFor={`field-${field.name}`}>{field.label}</label>
        <textarea
          id={`field-${field.name}`}
          rows={field.rows || 4}
          required={field.required}
          readOnly={field.readOnly}
          value={text(value)}
          onChange={(event) => setValue(field.name, event.target.value)}
        />
      </div>
    );
  }

  if (field.type === "select") {
    const options =
      field.optionsSource === "categories"
        ? categoryOptions
        : (field.options || []).map((option) => ({ value: option.value, label: option.label }));
    return (
      <div className="jp-admin__field">
        <label htmlFor={`field-${field.name}`}>{field.label}</label>
        <select
          id={`field-${field.name}`}
          value={text(value)}
          disabled={field.readOnly}
          onChange={(event) => setValue(field.name, event.target.value)}
        >
          {field.optionsSource === "categories" ? <option value="">No category</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "datetime" || field.type === "date") {
    return (
      <div className="jp-admin__field">
        <label htmlFor={`field-${field.name}`}>{field.label}</label>
        <input
          id={`field-${field.name}`}
          type={field.type === "date" ? "date" : "datetime-local"}
          value={
            field.type === "date"
              ? text(value).slice(0, 10)
              : toDateTimeInput(value)
          }
          onChange={(event) => setValue(field.name, event.target.value)}
        />
      </div>
    );
  }

  if (field.type === "tags") {
    return (
      <div className="jp-admin__field">
        <label htmlFor={`field-${field.name}`}>{field.label}</label>
        <input
          id={`field-${field.name}`}
          type="text"
          value={Array.isArray(value) ? value.join(", ") : text(value)}
          onChange={(event) => setValue(field.name, event.target.value)}
        />
        {field.help ? <span className="jp-admin__field-note">{field.help}</span> : null}
      </div>
    );
  }

  return (
    <div className="jp-admin__field">
      <label htmlFor={`field-${field.name}`}>{field.label}</label>
      <input
        id={`field-${field.name}`}
        type={field.type === "money" ? "number" : field.type}
        step={field.type === "money" ? "0.01" : field.step}
        min={field.min}
        max={field.max}
        required={field.required}
        readOnly={field.readOnly}
        placeholder={field.placeholder}
        value={text(value)}
        onChange={(event) => setValue(field.name, event.target.value)}
      />
      {field.help ? <span className="jp-admin__field-note">{field.help}</span> : null}
      {field.name === "id" && !isEdit ? (
        <span className="jp-admin__field-note">
          Numeric identifier. It cannot be changed after creation.
        </span>
      ) : null}
    </div>
  );
}

function ProductMedia({
  productId,
  productName,
  variantId,
  onClose,
}: {
  productId: number;
  productName: string;
  variantId?: number;
  onClose: () => void;
}) {
  const [images, setImages] = useState<AdminRecord[]>([]);
  const [pending, setPending] = useState<{ file: File; url: string }[]>([]);
  const [alt, setAlt] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    try {
      const query = variantId
        ? `variantId=${variantId}`
        : `productId=${productId}`;
      const data = await request<{ images: AdminRecord[] }>(`/api/admin/media?${query}`);
      setImages(data.images || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load images.");
    }
  }, [productId, variantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingRef = useRef<{ file: File; url: string }[]>([]);
  useEffect(
    () => () => {
      pendingRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [],
  );

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: { file: File; url: string }[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} is not an image.`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(`${file.name} is larger than 10 MB.`);
        continue;
      }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    if (next.length) {
      setError("");
      setPending((current) => [...current, ...next]);
    }
  };

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const upload = async () => {
    if (!pending.length) return;
    setBusy("upload");
    setError("");
    setNotice("");
    const form = new FormData();
    form.append("productId", String(productId));
    if (variantId) form.append("variantId", String(variantId));
    form.append("setPrimary", String(makePrimary));
    if (alt.trim()) form.append("alt", alt.trim());
    pending.forEach((item) => form.append("files", item.file));
    try {
      await request("/api/admin/media", { method: "POST", body: form });
      pending.forEach((item) => URL.revokeObjectURL(item.url));
      setPending([]);
      setAlt("");
      setMakePrimary(false);
      setNotice("Images uploaded.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy("");
    }
  };

  const replace = async (image: AdminRecord, file: File | undefined) => {
    if (!file) return;
    setBusy(`replace-${image.id}`);
    setError("");
    const form = new FormData();
    form.append("productId", String(productId));
    if (variantId) form.append("variantId", String(variantId));
    form.append("replaceImageId", String(image.id));
    form.append("file", file);
    try {
      await request("/api/admin/media", { method: "POST", body: form });
      setNotice("Image replaced.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Replacement failed.");
    } finally {
      setBusy("");
    }
  };

  const setPrimary = async (image: AdminRecord) => {
    setBusy(`primary-${image.id}`);
    try {
      await request(`/api/admin/media/${image.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update image.");
    } finally {
      setBusy("");
    }
  };

  const remove = async (image: AdminRecord) => {
    if (!window.confirm("Delete this image from ImageKit and the product?")) return;
    setBusy(`delete-${image.id}`);
    try {
      await request(`/api/admin/media/${image.id}`, { method: "DELETE" });
      setNotice("Image deleted.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="jp-admin__overlay" role="dialog" aria-modal="true" aria-labelledby="jp-media-title">
      <div className="jp-admin__modal">
        <div className="jp-admin__modal-head">
          <div>
            <p className="jp-admin__eyebrow">
              {variantId ? `Variant #${variantId}` : `Product #${productId}`}
            </p>
            <h2 className="jp-admin__modal-title" id="jp-media-title">
              {productName || "Product"} {variantId ? "variant" : ""} media
            </h2>
          </div>
          <button className="jp-admin__close" type="button" onClick={onClose} aria-label="Close media" title="Close media">
            <AdminIcon name="close" size={17} />
          </button>
        </div>

        <label
          className={`jp-admin__drop${dragging ? " is-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <strong style={{ fontSize: 13 }}>Drop images or click to choose</strong>
          <p className="jp-admin__muted" style={{ margin: "5px 0 0", fontSize: 11 }}>
            JPEG, PNG, WebP, AVIF · up to 10 MB each
          </p>
        </label>

        {pending.length ? (
          <>
            <div className="jp-admin__pending">
              {pending.map((item) => (
                <div className="jp-admin__pending-item" key={item.url}>
                  <img src={item.url} alt={item.file.name} />
                  <button
                    className="jp-admin__icon-btn jp-admin__icon-btn--subtle"
                    type="button"
                    aria-label={`Remove ${item.file.name}`}
                    data-tooltip="Remove image"
                    title="Remove image"
                    onClick={() => {
                      URL.revokeObjectURL(item.url);
                      setPending((current) => current.filter((pendingItem) => pendingItem.url !== item.url));
                    }}
                  >
                    <AdminIcon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="jp-admin__field">
              <label htmlFor="media-alt">Alt text</label>
              <input
                id="media-alt"
                type="text"
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                placeholder={productName}
              />
            </div>
            {variantId ? null : (
              <label className="jp-admin__check">
                <input
                  type="checkbox"
                  checked={makePrimary}
                  onChange={(event) => setMakePrimary(event.target.checked)}
                />
                Make the first image primary
              </label>
            )}
            <button
              className="jp-admin__btn"
              type="button"
              disabled={busy === "upload"}
              onClick={() => void upload()}
              style={{ marginTop: 10 }}
            >
              <AdminIcon name="upload" size={15} />
              {busy === "upload" ? "Uploading…" : `Upload ${pending.length} image${pending.length === 1 ? "" : "s"}`}
            </button>
          </>
        ) : null}

        {error ? <p className="jp-admin__error">{error}</p> : null}
        {notice ? <p className="jp-admin__notice">{notice}</p> : null}

        {images.length ? (
          <div className="jp-admin__media-grid">
            {images.map((image) => (
              <article className="jp-admin__tile" key={image.id}>
                <div className="jp-admin__thumb">
                  <img src={image.thumbnailUrl || image.url} alt={image.alt || productName} />
                  {image.isPrimary ? <span className="jp-admin__badge">Primary</span> : null}
                </div>
                <div className="jp-admin__tile-body">
                  <p className="jp-admin__tile-meta">
                    {image.width && image.height ? `${image.width} × ${image.height}` : "Image"}
                    {image.fileId ? ` · ${String(image.fileId).slice(0, 8)}…` : ""}
                  </p>
                  <div className="jp-admin__actions">
                    {!variantId && !image.isPrimary ? (
                      <button
                        className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small jp-admin__icon-btn jp-admin__icon-btn--primary"
                        type="button"
                        aria-label="Set primary image"
                        data-tooltip="Set primary"
                        title="Set primary"
                        disabled={busy === `primary-${image.id}`}
                        onClick={() => void setPrimary(image)}
                      >
                        <AdminIcon name="star" size={15} />
                      </button>
                    ) : null}
                    <label
                      className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small jp-admin__icon-btn"
                      style={{ cursor: "pointer" }}
                      aria-label="Replace image"
                      data-tooltip="Replace image"
                      title="Replace image"
                    >
                      <AdminIcon name="image" size={15} />
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          void replace(image, file);
                        }}
                      />
                    </label>
                    <button
                      className="jp-admin__btn jp-admin__btn--danger jp-admin__btn--small jp-admin__icon-btn"
                      type="button"
                      aria-label="Delete image"
                      data-tooltip="Delete image"
                      title="Delete image"
                      disabled={busy === `delete-${image.id}`}
                      onClick={() => void remove(image)}
                    >
                      <AdminIcon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="jp-admin__empty">No images yet.</div>
        )}
      </div>
    </div>
  );
}

export default function AdminClient() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState("");

  const [section, setSection] = useState<SectionKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsError, setStatsError] = useState("");

  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [listMeta, setListMeta] = useState({ page: 1, count: 0, totalPages: 1 });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [modal, setModal] = useState<{ mode: "create" | "edit"; record?: AdminRecord } | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mediaProduct, setMediaProduct] = useState<{
    id: number;
    name: string;
    variantId?: number;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRef = useRef<SectionKey>("dashboard");
  const modalRef = useRef(false);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const pendingFiltersRef = useRef<Record<string, string> | null>(null);

  const resource = section === "dashboard" ? null : ADMIN_RESOURCES[section];
  const columns = useMemo(() => (resource ? tableColumns(resource) : []), [resource]);
  const fields = useMemo(() => (resource ? formFields(resource) : []), [resource]);

  sectionRef.current = section;
  modalRef.current = Boolean(modal || mediaProduct);

  const selectSection = useCallback((next: SectionKey) => {
    setSection(next);
    setSidebarOpen(false);
    window.requestAnimationFrame(() => {
      mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);

  const loadSetup = useCallback(async () => {
    try {
      setSetup(await request<Setup>("/api/admin/setup"));
    } catch {
      setSetup({ configured: false, needsSetup: false, adminCount: 0 });
    }
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    document.title = "JP Admin";
    let active = true;
    (async () => {
      const [me, healthData] = await Promise.all([
        request<{ user: AdminUser | null }>("/api/accounts/me").catch(() => ({ user: null })),
        request<Health>("/api/health").catch(() => null),
      ]);
      if (!active) return;
      setUser(me.user);
      if (healthData) setHealth(healthData);
      await loadSetup();
      if (active) setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [loadSetup]);

  useEffect(() => {
    if (user?.role !== "admin" || !resource?.fields.some((field) => field.optionsSource === "categories")) {
      return;
    }
    request<ListResponse>("/api/admin/categories?limit=100&sort=name&order=asc")
      .then((data) =>
        setCategoryOptions(
          data.records.map((row) => ({
            value: text(row.id),
            label: `${text(row.name)} (${text(row.id)})`,
          })),
        ),
      )
      .catch(() => setCategoryOptions([]));
  }, [user, resource]);

  useEffect(() => {
    if (section === "dashboard") return;
    const activeResource = ADMIN_RESOURCES[section];
    setSort(activeResource.defaultSort.column);
    setOrder(activeResource.defaultSort.ascending ? "asc" : "desc");
    setQ("");
    setFilters(pendingFiltersRef.current ?? {});
    pendingFiltersRef.current = null;
    setPage(1);
    setRecords([]);
  }, [section]);

  const loadStats = useCallback(async () => {
    setStatsError("");
    try {
      setStats(await request<StatsResponse>("/api/admin/stats"));
    } catch (cause) {
      setStatsError(cause instanceof Error ? cause.message : "Could not load dashboard.");
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin" && section === "dashboard") void loadStats();
  }, [user, section, loadStats, refreshKey]);

  useEffect(() => {
    if (!resource || user?.role !== "admin") return;
    let active = true;
    const timer = setTimeout(async () => {
      setListLoading(true);
      setListError("");
      const params = new URLSearchParams({
        page: String(page),
        limit: resource.key === "delivery" ? "10" : "20",
        sort,
        order,
      });
      if (q.trim()) params.set("q", q.trim());
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== "") params.set(`filter_${key}`, value);
      });
      try {
        const data = await request<ListResponse>(`/api/admin/${resource.key}?${params}`);
        if (!active) return;
        setRecords(data.records || []);
        setListMeta({ page: data.page, count: data.count, totalPages: data.totalPages });
      } catch (cause) {
        if (!active) return;
        setRecords([]);
        setListError(cause instanceof Error ? cause.message : "Could not load records.");
      } finally {
        if (active) setListLoading(false);
      }
    }, q ? 260 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [resource, user, page, q, sort, order, filters, refreshKey]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    const source = new EventSource("/api/realtime");
    let timer: ReturnType<typeof setTimeout> | null = null;
    source.addEventListener("change", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { topic?: string };
        const topic = payload.topic || "";
        if (topic === "site_events") return;
        if (modalRef.current) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setRefreshKey((key) => key + 1), 600);
      } catch {
        // Ignore malformed events.
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      source.close();
    };
  }, [user]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError("");
    setBusy("signin");
    try {
      const data = await request<{ user: AdminUser }>("/api/accounts/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      setPassword("");
      await loadSetup();
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy("");
    }
  };

  const createAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError("");
    if (password.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setAuthError("Passwords do not match.");
      return;
    }
    setBusy("setup");
    try {
      const data = await request<{ user: AdminUser }>("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      setUser(data.user);
      setPassword("");
      setConfirm("");
      await loadSetup();
      flash("Administrator account created.");
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Could not create the account.");
    } finally {
      setBusy("");
    }
  };

  const signOut = async () => {
    await request("/api/accounts/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setStats(null);
    setRecords([]);
    setSection("dashboard");
  };

  const openCreate = () => {
    if (!resource) return;
    setForm(buildForm(resource));
    setFormError("");
    setModal({ mode: "create" });
  };

  const openEdit = (record: AdminRecord) => {
    if (!resource) return;
    setForm(buildForm(resource, record));
    setFormError("");
    setModal({ mode: "edit", record });
  };

  const setValue = (fieldName: string, value: any) =>
    setForm((current) => ({ ...current, [fieldName]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resource || !modal) return;
    setSaving(true);
    setFormError("");
    try {
      const body: Record<string, any> = {};
      for (const field of resource.fields) {
        if (field.name === "password" && modal.mode === "edit") continue;
        if (field.readOnly && modal.mode === "edit") continue;
        body[field.name] = form[field.name];
      }
      if (modal.mode === "create") {
        await request(`/api/admin/${resource.key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        flash(`${resource.singular} created.`);
      } else {
        const id = modal.record?.[resource.idColumn];
        await request(`/api/admin/${resource.key}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        flash(`${resource.singular} saved.`);
      }
      setModal(null);
      setRefreshKey((key) => key + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save the record.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (record: AdminRecord) => {
    if (!resource) return;
    const id = record[resource.idColumn];
    if (!window.confirm(`Delete this ${resource.singular.toLowerCase()}? This cannot be undone.`)) {
      return;
    }
    try {
      await request(`/api/admin/${resource.key}/${id}`, { method: "DELETE" });
      flash(`${resource.singular} deleted.`);
      setRefreshKey((key) => key + 1);
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "Delete failed.");
    }
  };

  const toggleSort = (column: string) => {
    if (sort === column) setOrder((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(column);
      setOrder("asc");
    }
    setPage(1);
  };

  const openOrder = async (id: unknown) => {
    setSection("orders");
    try {
      const data = await request<{ record: AdminRecord }>(`/api/admin/orders/${id}`);
      const record = data.record;
      setSection("orders");
      setForm(buildForm(ADMIN_RESOURCES.orders, record));
      setFormError("");
      setModal({ mode: "edit", record });
    } catch (cause) {
      flash(cause instanceof Error ? cause.message : "Could not open order.");
    }
  };

  if (checking) {
    return (
      <main className="jp-admin">
        <style>{styles}</style>
        <div className="jp-admin__loading">Checking your session…</div>
      </main>
    );
  }

  if (!user && setup?.needsSetup) {
    return (
      <main className="jp-admin">
        <style>{styles}</style>
        <form className="jp-admin__card jp-admin__login" onSubmit={createAdmin}>
          <p className="jp-admin__eyebrow">JP / Admin setup</p>
          <h1>Create the administrator</h1>
          <p className="jp-admin__muted" style={{ marginTop: 8 }}>
            This one-time setup is available because no administrator exists yet. Use a strong
            password and keep it safe.
          </p>
          <div className="jp-admin__field">
            <label htmlFor="setup-name">Full name</label>
            <input
              id="setup-name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="jp-admin__field">
            <label htmlFor="setup-email">Email</label>
            <input
              id="setup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="jp-admin__field">
            <label htmlFor="setup-password">Password</label>
            <input
              id="setup-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="jp-admin__field">
            <label htmlFor="setup-confirm">Confirm password</label>
            <input
              id="setup-confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          {authError ? <p className="jp-admin__error">{authError}</p> : null}
          <button
            className="jp-admin__btn"
            style={{ marginTop: 18, width: "100%" }}
            type="submit"
            disabled={busy === "setup"}
          >
            {busy === "setup" ? "Creating…" : "Create administrator"}
          </button>
          {health && !health.supabaseConfigured ? (
            <p className="jp-admin__banner" style={{ marginTop: 14 }}>
              Supabase is not configured. Setup cannot complete until environment variables are
              present.
            </p>
          ) : null}
        </form>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="jp-admin">
        <style>{styles}</style>
        <form className="jp-admin__card jp-admin__login" onSubmit={signIn}>
          <p className="jp-admin__eyebrow">JP / Admin</p>
          <h1>Sign in</h1>
          <p className="jp-admin__muted" style={{ marginTop: 8 }}>
            Manage the catalog, orders, content and media.
          </p>
          <div className="jp-admin__field">
            <label htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="jp-admin__field">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {authError ? <p className="jp-admin__error">{authError}</p> : null}
          <button
            className="jp-admin__btn"
            style={{ marginTop: 18, width: "100%" }}
            type="submit"
            disabled={busy === "signin"}
          >
            {busy === "signin" ? "Signing in…" : "Sign in"}
          </button>
          {setup && !setup.configured ? (
            <p className="jp-admin__banner" style={{ marginTop: 14 }}>
              Supabase is not configured, or the database migrations have not been applied.
            </p>
          ) : null}
        </form>
      </main>
    );
  }

  if (user.role !== "admin") {
    return (
      <main className="jp-admin">
        <style>{styles}</style>
        <div className="jp-admin__card jp-admin__login">
          <p className="jp-admin__eyebrow">JP / Admin</p>
          <h1>Not allowed</h1>
          <p className="jp-admin__muted" style={{ marginTop: 8 }}>
            You are signed in as {user.email}, but this account is not an administrator.
          </p>
          <button className="jp-admin__btn" style={{ marginTop: 18 }} type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  const statCards = stats
    ? [
        { label: "Revenue", value: money(stats.stats.revenue), note: "Excluding cancelled and refunded" },
        { label: "Orders", value: stats.stats.orders, note: `${stats.stats.pendingOrders} pending` },
        { label: "Products", value: stats.stats.products, note: `${stats.stats.categories} categories` },
        { label: "Customers", value: stats.stats.customers, note: "Registered accounts" },
      ]
    : [];

  return (
    <main className="jp-admin">
      <style>{styles}</style>
      <div className="jp-admin__shell">
        <aside className={`jp-admin__sidebar${sidebarOpen ? " is-open" : ""}`} id="jp-admin-sidebar">
          <div>
            <p className="jp-admin__eyebrow">JP / Control</p>
            <div className="jp-admin__brand">Admin</div>
          </div>
          <nav className="jp-admin__nav" aria-label="Admin sections">
            <button
              type="button"
              className="jp-admin__nav-item"
              aria-current={section === "dashboard" ? "page" : undefined}
              onClick={() => selectSection("dashboard")}
            >
              <span className="jp-admin__nav-mark">DB</span>
              Dashboard
            </button>
            {ADMIN_RESOURCE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="jp-admin__nav-item"
                aria-current={section === key ? "page" : undefined}
                onClick={() => selectSection(key)}
              >
                <span className="jp-admin__nav-mark">{ADMIN_RESOURCES[key].label.slice(0, 2).toUpperCase()}</span>
                {ADMIN_RESOURCES[key].label}
                {key === "orders" && stats?.stats.pendingOrders ? (
                  <span className="jp-admin__nav-count">{stats.stats.pendingOrders}</span>
                ) : null}
                {key === "reviews" && stats?.stats.pendingReviews ? (
                  <span className="jp-admin__nav-count">{stats.stats.pendingReviews}</span>
                ) : null}
                {key === "inquiries" && stats?.stats.newInquiries ? (
                  <span className="jp-admin__nav-count">{stats.stats.newInquiries}</span>
                ) : null}
              </button>
            ))}
          </nav>
          <div style={{ marginTop: "auto" }}>
            <p className="jp-admin__muted" style={{ margin: "0 0 10px" }}>
              {user.fullName}
              <br />
              {user.email}
            </p>
            <button className="jp-admin__btn jp-admin__btn--signout" type="button" onClick={signOut}>
              <AdminIcon name="logout" size={15} />
              Sign out
            </button>
          </div>
        </aside>

        <button
          className={`jp-admin__drawer-backdrop${sidebarOpen ? " is-open" : ""}`}
          type="button"
          aria-label="Close navigation"
          tabIndex={sidebarOpen ? 0 : -1}
          onClick={() => setSidebarOpen(false)}
        />

        <div className="jp-admin__main" id="jp-admin-content" ref={mainRef}>
          <header className="jp-admin__top">
            <div className="jp-admin__top-heading">
              <button
                className="jp-admin__menu-toggle"
                type="button"
                aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
                aria-controls="jp-admin-sidebar"
                aria-expanded={sidebarOpen}
                onClick={() => setSidebarOpen((open) => !open)}
              >
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </button>
              <div>
                <p className="jp-admin__eyebrow">{section === "dashboard" ? "Overview" : "Management"}</p>
                <h1>{sectionLabel(section)}</h1>
              </div>
            </div>
            <div className="jp-admin__top-actions">
              {section !== "dashboard" && resource?.canCreate ? (
                <button className="jp-admin__btn" type="button" onClick={openCreate}>
                  <AdminIcon name="plus" size={15} />
                  New {resource.singular}
                </button>
              ) : null}
              <button
                className="jp-admin__btn jp-admin__btn--ghost jp-admin__icon-btn"
                type="button"
                aria-label="Refresh data"
                data-tooltip="Refresh data"
                title="Refresh data"
                onClick={() => setRefreshKey((key) => key + 1)}
              >
                <AdminIcon name="refresh" size={16} />
              </button>
            </div>
          </header>

          {health && (!health.supabaseConfigured || !health.imagekitConfigured) ? (
            <p className="jp-admin__banner">
              {!health.supabaseConfigured
                ? "Supabase is not configured. Changes may fail and fallback data may be used. "
                : ""}
              {!health.imagekitConfigured
                ? "ImageKit is not configured. Image uploads are disabled."
                : ""}
            </p>
          ) : null}

          {section === "dashboard" ? (
            <>
              {statsError ? <p className="jp-admin__error">{statsError}</p> : null}
              {!stats && !statsError ? <div className="jp-admin__loading">Loading dashboard…</div> : null}
              {stats ? (
                <>
                  <div className="jp-admin__stats">
                    {statCards.map((card) => (
                      <div className="jp-admin__stat" key={card.label}>
                        <span>{card.label}</span>
                        <strong>{card.value}</strong>
                        <small>{card.note}</small>
                      </div>
                    ))}
                  </div>

                  <div className="jp-admin__dash">
                    <section className="jp-admin__card">
                      <div className="jp-admin__panel-head">
                        <div>
                          <h2 className="jp-admin__panel-title">Sales performance</h2>
                          <p className="jp-admin__muted" style={{ margin: "4px 0 0" }}>
                            Last 14 days
                          </p>
                        </div>
                      </div>
                      <div className="jp-admin__chart">
                        {stats.sales.map((day) => {
                          const max = Math.max(...stats.sales.map((item) => item.revenue), 1);
                          const height = Math.max(2, Math.round((day.revenue / max) * 100));
                          return (
                            <div className="jp-admin__bar" key={day.date} title={`${day.date}: ${money(day.revenue)} (${day.orders} orders)`}>
                              <i style={{ height: `${height}%` }} />
                              <small>{day.date.slice(5)}</small>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    <section className="jp-admin__card">
                      <div className="jp-admin__panel-head">
                        <div>
                          <h2 className="jp-admin__panel-title">Recent activity</h2>
                          <p className="jp-admin__muted" style={{ margin: "4px 0 0" }}>
                            Orders, reviews and inquiries
                          </p>
                        </div>
                      </div>
                      {stats.activity.length ? (
                        <div className="jp-admin__activity">
                          {stats.activity.map((item, index) => (
                            <div className="jp-admin__activity-item" key={`${item.type}-${index}`}>
                              <span className="jp-admin__dot" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <strong>{item.title}</strong>
                                <span>{item.detail}</span>
                                <span>{dateTime(item.at)}</span>
                              </div>
                              <span className={statusClass(item.status)}>{item.status}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="jp-admin__empty">No activity yet.</div>
                      )}
                    </section>
                  </div>

                  <div className="jp-admin__dash" style={{ marginTop: 16 }}>
                    <section className="jp-admin__card">
                      <div className="jp-admin__panel-head">
                        <h2 className="jp-admin__panel-title">Recent orders</h2>
                        <button className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small" type="button" onClick={() => setSection("orders")}>
                          View all
                        </button>
                      </div>
                      {stats.recentOrders.length ? (
                        <AdminTableWrap>
                          <table className="jp-admin__table" style={{ minWidth: 520 }}>
                            <thead>
                              <tr>
                                <th className="is-static">Order</th>
                                <th className="is-static">Customer</th>
                                <th className="is-static">Total</th>
                                <th className="is-static">Status</th>
                                <th className="is-static">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stats.recentOrders.map((row) => (
                                <tr key={row.id} onClick={() => void openOrder(row.id)} style={{ cursor: "pointer" }}>
                                  <td>{text(row.order_number)}</td>
                                  <td>{text(row.email)}</td>
                                  <td>{money(row.total, text(row.currency) || "USD")}</td>
                                  <td><span className={statusClass(row.status)}>{text(row.status)}</span></td>
                                  <td>{shortDate(row.placed_at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </AdminTableWrap>
                      ) : (
                        <div className="jp-admin__empty">No orders yet.</div>
                      )}
                    </section>

                    <section className="jp-admin__card">
                      <div className="jp-admin__panel-head">
                        <h2 className="jp-admin__panel-title">Needs attention</h2>
                      </div>
                      <div className="jp-admin__activity">
                        <div className="jp-admin__activity-item">
                          <span className="jp-admin__dot" />
                          <div style={{ flex: 1 }}>
                            <strong>{stats.stats.pendingOrders} pending orders</strong>
                            <span>Review and confirm fulfilment.</span>
                          </div>
                          <button className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small" type="button" onClick={() => setSection("orders")}>
                            Open
                          </button>
                        </div>
                        <div className="jp-admin__activity-item">
                          <span className="jp-admin__dot" />
                          <div style={{ flex: 1 }}>
                            <strong>{stats.stats.pendingReviews} reviews awaiting moderation</strong>
                            <span>Approve or reject customer reviews.</span>
                          </div>
                          <button className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small" type="button" onClick={() => setSection("reviews")}>
                            Open
                          </button>
                        </div>
                        <div className="jp-admin__activity-item">
                          <span className="jp-admin__dot" />
                          <div style={{ flex: 1 }}>
                            <strong>{stats.stats.newInquiries} new inquiries</strong>
                            <span>Respond to contact requests.</span>
                          </div>
                          <button className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small" type="button" onClick={() => setSection("inquiries")}>
                            Open
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                </>
              ) : null}
            </>
          ) : resource ? (
            <>
              <div className="jp-admin__toolbar">
                <label className="jp-admin__search">
                  <AdminIcon name="search" size={16} />
                  <input
                    className="jp-admin__input"
                    type="search"
                    aria-label={`Search ${resource.label}`}
                    placeholder={`Search ${resource.label.toLowerCase()}…`}
                    value={q}
                    onChange={(event) => {
                      setQ(event.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                {resource.key === "product-variants" ? (
                  <input
                    className="jp-admin__input"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label="Filter by product ID"
                    placeholder="Product ID"
                    value={filters.product_id ?? ""}
                    onChange={(event) => {
                      setFilters((current) => ({ ...current, product_id: event.target.value }));
                      setPage(1);
                    }}
                  />
                ) : null}
                {resource.fields
                  .filter((field) =>
                    ["status", "is_active", "role", "payment_status", "fulfillment_status", "placement", "category"].includes(
                      field.name,
                    ),
                  )
                  .map((field) => (
                    <select
                      key={field.name}
                      className="jp-admin__input"
                      aria-label={`Filter by ${field.label}`}
                      value={filters[field.name] ?? ""}
                      onChange={(event) => {
                        setFilters((current) => ({ ...current, [field.name]: event.target.value }));
                        setPage(1);
                      }}
                    >
                      <option value="">All {field.label.toLowerCase()}</option>
                      {(field.options || [
                        { value: "true", label: "Active" },
                        { value: "false", label: "Inactive" },
                      ]).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ))}
                {Object.keys(filters).some((key) => filters[key]) ? (
                  <button className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small" type="button" onClick={() => setFilters({})}>
                    Clear filters
                  </button>
                ) : null}
              </div>

              {listError ? <p className="jp-admin__error">{listError}</p> : null}
              {listLoading ? <div className="jp-admin__loading">Loading {resource.label.toLowerCase()}…</div> : null}

              {!listLoading && !listError && !records.length ? (
                <div className="jp-admin__empty">
                  No {resource.label.toLowerCase()} found.
                  {resource.canCreate ? " Create the first record to get started." : ""}
                </div>
              ) : null}

              {records.length ? (
                <AdminTableWrap>
                  <table className="jp-admin__table">
                    <thead>
                      <tr>
                        {columns.map((field) => (
                          <th key={field.name} onClick={() => toggleSort(field.name)} title={`Sort by ${field.label}`}>
                            {field.label}
                            {sort === field.name ? (order === "asc" ? " ↑" : " ↓") : ""}
                          </th>
                        ))}
                        <th className="is-static">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((row, index) => (
                        <tr key={text(row[resource.idColumn]) || index}>
                          {columns.map((field) => (
                            <td key={field.name}>{cellValue(resource, field, row)}</td>
                          ))}
                          <td>
                            <div className="jp-admin__row-actions">
                              <button
                                className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small jp-admin__icon-btn"
                                type="button"
                                aria-label="Edit record"
                                data-tooltip="Edit"
                                title="Edit"
                                onClick={() => openEdit(row)}
                              >
                                <AdminIcon name="edit" size={15} />
                              </button>
                              {resource.key === "products" ? (
                                <>
                                  <button
                                    className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small jp-admin__icon-btn"
                                    type="button"
                                    aria-label="Manage product variants"
                                    data-tooltip="Variants"
                                    title="Variants"
                                    onClick={() => {
                                      pendingFiltersRef.current = {
                                        product_id: String(row.id),
                                      };
                                      selectSection("product-variants");
                                    }}
                                  >
                                    <AdminIcon name="layers" size={15} />
                                  </button>
                                  <button
                                    className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small jp-admin__icon-btn"
                                    type="button"
                                    aria-label="Manage product media"
                                    data-tooltip="Media"
                                    title="Media"
                                    onClick={() =>
                                      setMediaProduct({ id: Number(row.id), name: text(row.name) })
                                    }
                                  >
                                    <AdminIcon name="image" size={15} />
                                  </button>
                                </>
                              ) : null}
                              {resource.key === "product-variants" ? (
                                <button
                                  className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small jp-admin__icon-btn"
                                  type="button"
                                  aria-label="Manage variant images"
                                  data-tooltip="Variant images"
                                  title="Variant images"
                                  onClick={() =>
                                    setMediaProduct({
                                      id: Number(row.product_id),
                                      name: `${text(row.color || row.shape || "Variant")} ${text(row.sku || "")}`.trim(),
                                      variantId: Number(row.id),
                                    })
                                  }
                                >
                                  <AdminIcon name="image" size={15} />
                                </button>
                              ) : null}
                              {resource.key === "orders" ? (
                                <button
                                  className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small jp-admin__icon-btn"
                                  type="button"
                                  aria-label="Open order"
                                  data-tooltip="Open"
                                  title="Open"
                                  onClick={() => void openOrder(row.id)}
                                >
                                  <AdminIcon name="external" size={15} />
                                </button>
                              ) : null}
                              {resource.canDelete ? (
                                <button
                                  className="jp-admin__btn jp-admin__btn--danger jp-admin__btn--small jp-admin__icon-btn"
                                  type="button"
                                  aria-label="Delete record"
                                  data-tooltip="Delete"
                                  title="Delete"
                                  onClick={() => void remove(row)}
                                >
                                  <AdminIcon name="trash" size={15} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AdminTableWrap>
              ) : null}

              {resource.key !== "delivery" && listMeta.totalPages > 1 ? (
                <div className="jp-admin__pager">
                  <span>
                    Page {listMeta.page} of {listMeta.totalPages} · {listMeta.count} records
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                      Previous
                    </button>
                    <button className="jp-admin__btn jp-admin__btn--ghost jp-admin__btn--small" type="button" disabled={page >= listMeta.totalPages} onClick={() => setPage((current) => current + 1)}>
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {modal && resource ? (
        <div className="jp-admin__overlay" role="dialog" aria-modal="true" aria-labelledby="jp-form-title">
          <form className="jp-admin__modal" onSubmit={save}>
            <div className="jp-admin__modal-head">
              <div>
                <p className="jp-admin__eyebrow">{modal.mode === "create" ? "New record" : `Editing ${resource.singular.toLowerCase()}`}</p>
                <h2 className="jp-admin__modal-title" id="jp-form-title">
                  {modal.mode === "create" ? `New ${resource.singular}` : text(modal.record?.name || modal.record?.order_number || modal.record?.id)}
                </h2>
              </div>
              <button className="jp-admin__close" type="button" onClick={() => setModal(null)} aria-label="Close form" title="Close form">
                <AdminIcon name="close" size={17} />
              </button>
            </div>

            <div className="jp-admin__form-grid">
              {fields.map((field) => (
                <FieldControl
                  key={field.name}
                  field={field}
                  value={form[field.name]}
                  record={modal.record || {}}
                  form={form}
                  setValue={setValue}
                  categoryOptions={categoryOptions}
                  isEdit={modal.mode === "edit"}
                />
              ))}
            </div>

            {resource.key === "orders" && Array.isArray(modal.record?.order_items) ? (
              <section className="jp-admin__order-items" aria-labelledby="jp-order-items-title">
                <h3 className="jp-admin__section-title" id="jp-order-items-title">
                  Order items & requirements
                </h3>
                <div className="jp-admin__order-items-list">
                  {modal.record.order_items.map((item: AdminRecord) => (
                    <article className="jp-admin__order-item" key={text(item.id) || `${text(item.product_id)}-${text(item.name)}`}>
                      <div>
                        <strong>{text(item.name) || "Product"}</strong>
                        <span>
                          {Number(item.quantity || 0)} × {money(item.unit_price, text(modal.record?.currency) || "USD")}
                        </span>
                      </div>
                      {item.customer_requirements ? (
                        <p>
                          <span>Customer requirements</span>
                          {text(item.customer_requirements)}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {formError ? <p className="jp-admin__error">{formError}</p> : null}
            <div className="jp-admin__modal-actions">
              <button className="jp-admin__btn jp-admin__btn--ghost" type="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="jp-admin__btn" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {mediaProduct ? (
        <ProductMedia
          productId={mediaProduct.id}
          productName={mediaProduct.name}
          variantId={mediaProduct.variantId}
          onClose={() => setMediaProduct(null)}
        />
      ) : null}

      {toast ? <div className="jp-admin__toast">{toast}</div> : null}
    </main>
  );
}
