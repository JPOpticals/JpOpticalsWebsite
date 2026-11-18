export type AdminFieldType =
  | "text"
  | "textarea"
  | "number"
  | "money"
  | "boolean"
  | "select"
  | "date"
  | "datetime"
  | "email"
  | "password"
  | "image"
  | "json"
  | "tags";

export type AdminOption = { value: string; label: string };

export type AdminField = {
  name: string;
  label: string;
  type: AdminFieldType;
  required?: boolean;
  options?: AdminOption[];
  optionsSource?: "categories";
  placeholder?: string;
  help?: string;
  step?: string;
  min?: number;
  max?: number;
  rows?: number;
  defaultValue?: unknown;
  hideInTable?: boolean;
  hideInForm?: boolean;
  readOnly?: boolean;
  uploadFolder?: string;
  fileIdField?: string;
  accept?: string;
};

export type AdminResourceKey =
  | "categories"
  | "products"
  | "product-variants"
  | "customizer-frames"
  | "customizer-lenses"
  | "orders"
  | "customers"
  | "reviews"
  | "inquiries"
  | "hero-slides"
  | "announcements"
  | "delivery"
  | "faqs";

export type AdminResource = {
  key: AdminResourceKey;
  label: string;
  singular: string;
  description: string;
  table: string;
  idColumn: string;
  fields: AdminField[];
  searchFields: string[];
  defaultSort: { column: string; ascending: boolean };
  canCreate: boolean;
  canDelete: boolean;
  detailSelect?: string;
  uploadRoot?: string;
};

const ACTIVE: AdminField = {
  name: "is_active",
  label: "Active",
  type: "boolean",
  defaultValue: true,
};

const SORT_ORDER: AdminField = {
  name: "sort_order",
  label: "Sort order",
  type: "number",
  defaultValue: 0,
};

const DATES: AdminField[] = [
  { name: "starts_at", label: "Starts at", type: "datetime", hideInTable: true },
  { name: "ends_at", label: "Ends at", type: "datetime", hideInTable: true },
];

const ORDER_STATUS: AdminOption[] = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

const PAYMENT_STATUS: AdminOption[] = [
  { value: "unpaid", label: "Unpaid" },
  { value: "authorized", label: "Authorized" },
  { value: "paid", label: "Paid" },
  { value: "partially_refunded", label: "Partially refunded" },
  { value: "refunded", label: "Refunded" },
  { value: "failed", label: "Failed" },
];

const FULFILLMENT_STATUS: AdminOption[] = [
  { value: "unfulfilled", label: "Unfulfilled" },
  { value: "partially_fulfilled", label: "Partially fulfilled" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "returned", label: "Returned" },
];

const REVIEW_STATUS: AdminOption[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const INQUIRY_STATUS: AdminOption[] = [
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "spam", label: "Spam" },
];

export const ADMIN_RESOURCES: Record<AdminResourceKey, AdminResource> = {
  categories: {
    key: "categories",
    label: "Categories",
    singular: "Category",
    description: "Navigation categories shown across the storefront.",
    table: "categories",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["name", "slug", "id"],
    defaultSort: { column: "sort_order", ascending: true },
    uploadRoot: "jp/categories",
    fields: [
      { name: "id", label: "ID", type: "text", required: true, placeholder: "sunglasses" },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "href", label: "Link", type: "text", required: true, placeholder: "/shop?type_frame=Sunglasses" },
      { name: "description", label: "Description", type: "textarea", rows: 3, hideInTable: true },
      {
        name: "image_url",
        label: "Category image",
        type: "image",
        uploadFolder: "jp/categories",
        fileIdField: "image_file_id",
        hideInTable: true,
      },
      { name: "image_file_id", label: "Image file ID", type: "text", hideInTable: true, hideInForm: true },
      { name: "image_alt", label: "Image alt text", type: "text", hideInTable: true },
      SORT_ORDER,
      ACTIVE,
    ],
  },
  products: {
    key: "products",
    label: "Products",
    singular: "Product",
    description: "Catalog products, pricing, visibility and media.",
    table: "products",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["name", "brand", "model", "slug"],
    defaultSort: { column: "sort_order", ascending: true },
    uploadRoot: "jp/products",
    fields: [
      { name: "id", label: "Product ID", type: "number", required: false, hideInForm: false },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "brand", label: "Brand", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "path", label: "Storefront path", type: "text", required: true, placeholder: "/product/1234" },
      {
        name: "category_id",
        label: "Category",
        type: "select",
        optionsSource: "categories",
        hideInTable: true,
      },
      { name: "collection_id", label: "Collection ID", type: "number", hideInTable: true },
      { name: "subcategory_id", label: "Subcategory ID", type: "text", hideInTable: true },
      { name: "model", label: "Model", type: "text" },
      {
        name: "frame_type",
        label: "Frame type",
        type: "select",
        options: [
          { value: "Optical", label: "Optical" },
          { value: "Sunglasses", label: "Sunglasses" },
          { value: "Eyewear", label: "Eyewear" },
        ],
        defaultValue: "Optical",
      },
      {
        name: "gender",
        label: "Gender",
        type: "select",
        options: [
          { value: "", label: "Unspecified" },
          { value: "Male", label: "Male" },
          { value: "Female", label: "Female" },
          { value: "Unisex", label: "Unisex" },
          { value: "Kids", label: "Kids" },
        ],
      },
      { name: "shape", label: "Shape", type: "text", hideInTable: true },
      { name: "material", label: "Material", type: "text", hideInTable: true },
      { name: "color", label: "Color", type: "text", hideInTable: true },
      { name: "color_code", label: "Color code", type: "text", hideInTable: true },
      { name: "size", label: "Size", type: "text", hideInTable: true },
      { name: "price", label: "Price", type: "money", required: true, defaultValue: 0 },
      { name: "currency", label: "Currency", type: "text", defaultValue: "USD" },
      { name: "short_description", label: "Short description", type: "textarea", rows: 3, hideInTable: true },
      { name: "description", label: "Description", type: "textarea", rows: 6, hideInTable: true },
      { name: "details", label: "Details (JSON)", type: "json", rows: 4, hideInTable: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "active", label: "Active" },
          { value: "draft", label: "Draft" },
          { value: "archived", label: "Archived" },
        ],
        defaultValue: "active",
      },
      { name: "is_featured", label: "Featured", type: "boolean", defaultValue: false },
      { name: "is_transitions", label: "Transitions", type: "boolean", defaultValue: true, hideInTable: true },
      SORT_ORDER,
    ],
  },
  "product-variants": {
    key: "product-variants",
    label: "Product Variants",
    singular: "Product variant",
    description: "Shapes, designs, colors, sizes, images and stock for each product.",
    table: "product_variants",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["sku", "shape", "design", "color", "size"],
    defaultSort: { column: "sort_order", ascending: true },
    uploadRoot: "jp/variants",
    fields: [
      { name: "id", label: "Variant ID", type: "number", readOnly: true, hideInForm: true },
      { name: "product_id", label: "Product ID", type: "number", required: true, min: 1, help: "The catalog product this variant belongs to." },
      { name: "sku", label: "SKU", type: "text", placeholder: "JP-BB0341O-BLK-M" },
      { name: "shape", label: "Shape", type: "text", placeholder: "Cat-Eye" },
      { name: "design", label: "Design", type: "text", placeholder: "Full Frame" },
      { name: "color", label: "Color", type: "text", placeholder: "Black" },
      { name: "color_code", label: "Color code", type: "text", placeholder: "#171717 or 001" },
      { name: "size", label: "Size", type: "text", placeholder: "M" },
      { name: "stock", label: "Stock", type: "number", min: 0, defaultValue: 0 },
      { name: "price_override", label: "Price override", type: "money", min: 0, hideInTable: true, help: "Leave empty to use the product price." },
      {
        name: "image_url",
        label: "Variant thumbnail",
        type: "image",
        uploadFolder: "jp/variants",
        fileIdField: "image_file_id",
        hideInTable: true,
      },
      { name: "image_file_id", label: "Image file ID", type: "text", hideInTable: true, hideInForm: true },
      { name: "image_alt", label: "Image alt text", type: "text", hideInTable: true },
      { name: "is_active", label: "Active", type: "boolean", defaultValue: true },
      SORT_ORDER,
      { name: "metadata", label: "Metadata (JSON)", type: "json", rows: 3, hideInTable: true },
    ],
  },
  "customizer-frames": {
    key: "customizer-frames",
    label: "Customizer Frames",
    singular: "Customizer frame",
    description: "Frames available to the live eyewear builder.",
    table: "customizer_frames",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["name", "style", "frame_type", "color", "material"],
    defaultSort: { column: "sort_order", ascending: true },
    uploadRoot: "jp/customizer/frames",
    fields: [
      { name: "id", label: "ID", type: "text", readOnly: true, hideInForm: true },
      { name: "product_id", label: "Catalog product ID", type: "number", min: 1, hideInTable: true },
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "style",
        label: "Style",
        type: "select",
        options: [
          { value: "Round", label: "Round" },
          { value: "Square", label: "Square" },
          { value: "Rectangle", label: "Rectangle" },
          { value: "Aviator", label: "Aviator" },
          { value: "Cat-eye", label: "Cat-eye" },
          { value: "Rimless", label: "Rimless" },
          { value: "Classic", label: "Classic" },
        ],
        defaultValue: "Classic",
      },
      {
        name: "frame_type",
        label: "Frame type",
        type: "select",
        options: [
          { value: "Optical", label: "Optical" },
          { value: "Sunglasses", label: "Sunglasses" },
          { value: "Eyewear", label: "Eyewear" },
        ],
        defaultValue: "Optical",
      },
      { name: "material", label: "Material", type: "text" },
      { name: "color", label: "Color", type: "text" },
      { name: "color_code", label: "Color code", type: "text", placeholder: "#171717" },
      { name: "price", label: "Frame price", type: "money", required: true, defaultValue: 0, min: 0 },
      { name: "currency", label: "Currency", type: "text", defaultValue: "USD" },
      {
        name: "image_url",
        label: "Preview image",
        type: "image",
        uploadFolder: "jp/customizer/frames",
        fileIdField: "image_file_id",
        hideInTable: true,
      },
      { name: "image_file_id", label: "Image file ID", type: "text", hideInTable: true, hideInForm: true },
      {
        name: "lens_mask_url",
        label: "Lens mask",
        type: "image",
        uploadFolder: "jp/customizer/frames/masks",
        fileIdField: "lens_mask_file_id",
        hideInTable: true,
        help: "Optional transparent PNG aligned to the preview image. White/opaque areas mark the lens surfaces.",
      },
      { name: "lens_mask_file_id", label: "Lens mask file ID", type: "text", hideInTable: true, hideInForm: true },
      { name: "image_alt", label: "Image alt text", type: "text", hideInTable: true },
      { name: "description", label: "Description", type: "textarea", rows: 3, hideInTable: true },
      {
        name: "metadata",
        label: "Metadata (JSON)",
        type: "json",
        rows: 5,
        hideInTable: true,
        help: 'Optional exact fallback geometry: {"preview":{"lensGeometry":{"left":{"x":17,"y":39,"width":31,"height":25},"right":{"x":52,"y":39,"width":31,"height":25}}}}',
      },
      SORT_ORDER,
      ACTIVE,
    ],
  },
  "customizer-lenses": {
    key: "customizer-lenses",
    label: "Customizer Lenses",
    singular: "Customizer lens",
    description: "Lens types, colors, tint preview values and pricing.",
    table: "customizer_lenses",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["name", "lens_type", "style", "color"],
    defaultSort: { column: "sort_order", ascending: true },
    uploadRoot: "jp/customizer/lenses",
    fields: [
      { name: "id", label: "ID", type: "text", readOnly: true, hideInForm: true },
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "lens_type",
        label: "Lens type",
        type: "select",
        options: [
          { value: "Clear", label: "Clear" },
          { value: "Blue-light", label: "Blue light" },
          { value: "Tinted", label: "Tinted" },
          { value: "Polarized", label: "Polarized" },
          { value: "Photochromic", label: "Photochromic" },
          { value: "Prescription", label: "Prescription" },
        ],
        defaultValue: "Clear",
      },
      { name: "style", label: "Style", type: "text", defaultValue: "Classic" },
      { name: "color", label: "Color", type: "text", required: true, defaultValue: "Clear" },
      { name: "color_code", label: "Color code", type: "text", required: true, defaultValue: "#e8eef1" },
      {
        name: "tint_opacity",
        label: "Preview opacity",
        type: "number",
        min: 0,
        max: 1,
        step: "0.01",
        required: true,
        defaultValue: 0.2,
        help: "Used only for the live preview. Enter a value from 0 to 1.",
      },
      { name: "price", label: "Lens price", type: "money", required: true, defaultValue: 0, min: 0 },
      { name: "currency", label: "Currency", type: "text", defaultValue: "USD" },
      {
        name: "image_url",
        label: "Lens image",
        type: "image",
        uploadFolder: "jp/customizer/lenses",
        fileIdField: "image_file_id",
        hideInTable: true,
      },
      { name: "image_file_id", label: "Image file ID", type: "text", hideInTable: true, hideInForm: true },
      { name: "image_alt", label: "Image alt text", type: "text", hideInTable: true },
      { name: "description", label: "Description", type: "textarea", rows: 3, hideInTable: true },
      { name: "metadata", label: "Metadata (JSON)", type: "json", rows: 3, hideInTable: true },
      SORT_ORDER,
      ACTIVE,
    ],
  },
  orders: {
    key: "orders",
    label: "Orders",
    singular: "Order",
    description: "Customer orders, payment state and fulfilment.",
    table: "orders",
    idColumn: "id",
    canCreate: false,
    canDelete: true,
    searchFields: ["order_number", "email"],
    defaultSort: { column: "placed_at", ascending: false },
    detailSelect:
      "*, order_items(id,product_id,variant_id,name,image_url,unit_price,quantity,line_total,customer_requirements,metadata)",
    fields: [
      { name: "order_number", label: "Order", type: "text", readOnly: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "text", hideInTable: true },
      { name: "status", label: "Status", type: "select", options: ORDER_STATUS, defaultValue: "pending" },
      {
        name: "payment_status",
        label: "Payment",
        type: "select",
        options: PAYMENT_STATUS,
        defaultValue: "unpaid",
      },
      {
        name: "fulfillment_status",
        label: "Fulfilment",
        type: "select",
        options: FULFILLMENT_STATUS,
        defaultValue: "unfulfilled",
        hideInTable: true,
      },
      { name: "subtotal", label: "Subtotal", type: "money", readOnly: true, hideInTable: true },
      { name: "shipping_total", label: "Shipping", type: "money", hideInTable: true },
      { name: "tax_total", label: "Tax", type: "money", hideInTable: true },
      { name: "discount_total", label: "Discount", type: "money", hideInTable: true },
      { name: "total", label: "Total", type: "money" },
      { name: "currency", label: "Currency", type: "text", defaultValue: "USD", hideInTable: true },
      { name: "shipping_address", label: "Shipping address (JSON)", type: "json", rows: 4, hideInTable: true },
      { name: "billing_address", label: "Billing address (JSON)", type: "json", rows: 4, hideInTable: true },
      { name: "notes", label: "Notes", type: "textarea", rows: 3, hideInTable: true },
      { name: "metadata", label: "Metadata (JSON)", type: "json", rows: 3, hideInTable: true },
    ],
  },
  customers: {
    key: "customers",
    label: "Customers",
    singular: "Customer",
    description: "Accounts, contact details and administrator roles.",
    table: "customers",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["email", "full_name", "phone"],
    defaultSort: { column: "created_at", ascending: false },
    fields: [
      { name: "id", label: "ID", type: "text", readOnly: true, hideInForm: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "full_name", label: "Full name", type: "text" },
      { name: "phone", label: "Phone", type: "text" },
      {
        name: "role",
        label: "Role",
        type: "select",
        options: [
          { value: "customer", label: "Customer" },
          { value: "admin", label: "Administrator" },
        ],
        defaultValue: "customer",
      },
      {
        name: "password",
        label: "Temporary password",
        type: "password",
        hideInTable: true,
        help: "Required when creating a customer. Minimum 8 characters.",
      },
      { name: "metadata", label: "Metadata (JSON)", type: "json", rows: 3, hideInTable: true },
    ],
  },
  reviews: {
    key: "reviews",
    label: "Reviews",
    singular: "Review",
    description: "Moderate customer reviews before they appear on the site.",
    table: "reviews",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["author_name", "author_email", "body", "title"],
    defaultSort: { column: "created_at", ascending: false },
    fields: [
      { name: "product_id", label: "Product ID", type: "number" },
      { name: "author_name", label: "Author", type: "text", required: true },
      { name: "author_email", label: "Author email", type: "email", hideInTable: true },
      { name: "rating", label: "Rating", type: "number", min: 1, max: 5, required: true, defaultValue: 5 },
      { name: "title", label: "Title", type: "text", hideInTable: true },
      { name: "body", label: "Review", type: "textarea", rows: 5, required: true, hideInTable: true },
      {
        name: "source",
        label: "Source",
        type: "select",
        options: [
          { value: "site", label: "Website" },
          { value: "google", label: "Google" },
          { value: "import", label: "Imported" },
        ],
        defaultValue: "site",
        hideInTable: true,
      },
      { name: "status", label: "Status", type: "select", options: REVIEW_STATUS, defaultValue: "pending" },
      { name: "is_verified", label: "Verified", type: "boolean", defaultValue: false, hideInTable: true },
      { name: "reviewed_at", label: "Reviewed at", type: "datetime", hideInTable: true },
      { name: "metadata", label: "Metadata (JSON)", type: "json", rows: 3, hideInTable: true },
    ],
  },
  inquiries: {
    key: "inquiries",
    label: "Inquiries",
    singular: "Inquiry",
    description: "Contact messages and support requests.",
    table: "inquiries",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["name", "email", "subject", "message"],
    defaultSort: { column: "created_at", ascending: false },
    fields: [
      { name: "name", label: "Name", type: "text" },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "text", hideInTable: true },
      { name: "subject", label: "Subject", type: "text" },
      {
        name: "source",
        label: "Source",
        type: "select",
        options: [
          { value: "contact", label: "Contact" },
          { value: "product", label: "Product" },
          { value: "support", label: "Support" },
          { value: "other", label: "Other" },
        ],
        defaultValue: "contact",
        hideInTable: true,
      },
      { name: "message", label: "Message", type: "textarea", rows: 6, required: true, hideInTable: true },
      { name: "status", label: "Status", type: "select", options: INQUIRY_STATUS, defaultValue: "new" },
      { name: "metadata", label: "Metadata (JSON)", type: "json", rows: 3, hideInTable: true },
    ],
  },
  "hero-slides": {
    key: "hero-slides",
    label: "Hero Slides",
    singular: "Hero slide",
    description: "Homepage hero campaigns and media.",
    table: "hero_slides",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["name", "subtitle"],
    defaultSort: { column: "sort_order", ascending: true },
    uploadRoot: "jp/hero",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "subtitle", label: "Subtitle", type: "text" },
      { name: "cta_label", label: "CTA label", type: "text" },
      { name: "cta_href", label: "CTA link", type: "text" },
      {
        name: "desktop_image_url",
        label: "Desktop image",
        type: "image",
        uploadFolder: "jp/hero",
        fileIdField: "desktop_file_id",
        hideInTable: true,
      },
      { name: "desktop_file_id", label: "Desktop file ID", type: "text", hideInTable: true, hideInForm: true },
      {
        name: "mobile_image_url",
        label: "Mobile image",
        type: "image",
        uploadFolder: "jp/hero",
        fileIdField: "mobile_file_id",
        hideInTable: true,
      },
      { name: "mobile_file_id", label: "Mobile file ID", type: "text", hideInTable: true, hideInForm: true },
      { name: "video_url", label: "Video URL", type: "text", hideInTable: true },
      { name: "video_file_id", label: "Video file ID", type: "text", hideInTable: true, hideInForm: true },
      { name: "duration_ms", label: "Duration (ms)", type: "number", defaultValue: 8000, min: 1000 },
      SORT_ORDER,
      ACTIVE,
      ...DATES,
      { name: "metadata", label: "Metadata (JSON)", type: "json", rows: 3, hideInTable: true },
    ],
  },
  announcements: {
    key: "announcements",
    label: "Announcements",
    singular: "Announcement",
    description: "Storefront messages and scheduled notices.",
    table: "announcements",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["message", "link_label"],
    defaultSort: { column: "sort_order", ascending: true },
    fields: [
      { name: "message", label: "Message", type: "textarea", rows: 3, required: true },
      { name: "link_label", label: "Link label", type: "text", hideInTable: true },
      { name: "link_href", label: "Link URL", type: "text", hideInTable: true },
      {
        name: "placement",
        label: "Placement",
        type: "select",
        options: [
          { value: "homepage", label: "Homepage" },
          { value: "topbar", label: "Top bar" },
          { value: "modal", label: "Modal" },
          { value: "footer", label: "Footer" },
        ],
        defaultValue: "homepage",
      },
      SORT_ORDER,
      ACTIVE,
      ...DATES,
      { name: "metadata", label: "Metadata (JSON)", type: "json", rows: 3, hideInTable: true },
    ],
  },
  delivery: {
    key: "delivery",
    label: "Delivery Settings",
    singular: "Delivery settings",
    description: "Shipping methods, thresholds and policy notes.",
    table: "delivery_settings",
    idColumn: "id",
    canCreate: false,
    canDelete: false,
    searchFields: [],
    defaultSort: { column: "id", ascending: true },
    fields: [
      { name: "standard_label", label: "Standard label", type: "text", required: true },
      { name: "standard_days_min", label: "Standard min days", type: "number", min: 0, defaultValue: 3 },
      { name: "standard_days_max", label: "Standard max days", type: "number", min: 0, defaultValue: 5 },
      { name: "standard_price", label: "Standard price", type: "money", defaultValue: 0 },
      { name: "express_label", label: "Express label", type: "text", hideInTable: true },
      { name: "express_days_min", label: "Express min days", type: "number", min: 0, hideInTable: true },
      { name: "express_days_max", label: "Express max days", type: "number", min: 0, hideInTable: true },
      { name: "express_price", label: "Express price", type: "money", hideInTable: true },
      { name: "free_shipping_threshold", label: "Free shipping threshold", type: "money", hideInTable: true },
      { name: "ships_to", label: "Ships to", type: "tags", help: "Comma-separated country codes, e.g. US, CA", hideInTable: true },
      { name: "tax_note", label: "Tax note", type: "textarea", rows: 2, hideInTable: true },
      { name: "returns_note", label: "Returns note", type: "textarea", rows: 3, hideInTable: true },
      { name: "metadata", label: "Metadata (JSON)", type: "json", rows: 2, hideInTable: true },
    ],
  },
  faqs: {
    key: "faqs",
    label: "Global FAQs",
    singular: "FAQ",
    description: "Questions shown on the help and FAQ page.",
    table: "faqs",
    idColumn: "id",
    canCreate: true,
    canDelete: true,
    searchFields: ["question", "answer", "category"],
    defaultSort: { column: "sort_order", ascending: true },
    fields: [
      { name: "category", label: "Category", type: "text", defaultValue: "general" },
      { name: "question", label: "Question", type: "text", required: true },
      { name: "answer", label: "Answer", type: "textarea", rows: 5, required: true, hideInTable: true },
      SORT_ORDER,
      ACTIVE,
    ],
  },
};

export const ADMIN_RESOURCE_KEYS = Object.keys(ADMIN_RESOURCES) as AdminResourceKey[];

export const getAdminResource = (key: string): AdminResource | null =>
  ADMIN_RESOURCES[key as AdminResourceKey] ?? null;

export const tableColumns = (resource: AdminResource) =>
  resource.fields.filter((field) => !field.hideInTable);

export const formFields = (resource: AdminResource) =>
  resource.fields.filter((field) => !field.hideInForm);
