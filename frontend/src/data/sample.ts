export type Tx = {
  id: string;
  amount: number;
  merchant: string;
  score: number;            // 0..1
  status: "blocked"|"flagged"|"review";
  reason: string;
  ts_iso: string;
};

export type Alert = {
  id: string;
  title: string;
  severity: "critical"|"high"|"medium";
  status: "active"|"investigating"|"resolved";
  amount: string;
  merchant: string;
  ts_iso: string;
};

export const txs: Tx[] = [
  { id:"TXN-001234", amount:2450, merchant:"Online Store XYZ", score:.95, status:"blocked", reason:"Unusual spending pattern", ts_iso:"2024-01-15T14:32:18Z"},
  { id:"TXN-001235", amount:850, merchant:"Gas Station ABC", score:.87, status:"flagged", reason:"Geographic anomaly", ts_iso:"2024-01-15T14:25:22Z"},
  { id:"TXN-001237", amount:350, merchant:"Coffee Shop DEF", score:.78, status:"review", reason:"Card not present", ts_iso:"2024-01-15T14:23:10Z"},
  { id:"TXN-001238", amount:5500, merchant:"Luxury Retailer", score:.98, status:"blocked", reason:"High value anomaly", ts_iso:"2024-01-15T18:15:33Z"},
];

export const alerts: Alert[] = [
  { id:"ALT-001", title:"High-Risk Transaction Detected", severity:"critical", status:"active", amount:"$2,450.00", merchant:"Online Store XYZ", ts_iso:"2024-01-15T14:32:18Z"},
  { id:"ALT-002", title:"Geographic Anomaly Alert", severity:"high", status:"investigating", amount:"$850.00", merchant:"Gas Station ABC", ts_iso:"2024-01-15T14:25:22Z"},
  { id:"ALT-003", title:"Velocity Threshold Exceeded", severity:"critical", status:"active", amount:"$5,500.00", merchant:"Luxury Retailer", ts_iso:"2024-01-15T18:15:33Z"},
];
