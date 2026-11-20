// Tüm alan tipleri tek dosyada.
export type Currency = "TRY" | "USD" | "EUR";
/** Kuruş (minor unit) cinsinden tam sayı + para birimi. Para birimleri asla çevrilmez/toplanmaz. */
export interface Money { amount: number; currency: Currency }

export interface BaseRecord { id: string; createdAt: string; archived: boolean }

export interface Customer extends BaseRecord { firstName: string; lastName: string; phone: string; phone2?: string | undefined; address?: string | undefined; note?: string | undefined }
/** plate her zaman normalize edilmiş halde saklanır (büyük harf, boşluksuz). */
export interface Vehicle extends BaseRecord { customerId: string; plate: string; brand: string; model: string; year?: number | undefined; type: string; vin?: string | undefined; engineNo?: string | undefined; description?: string | undefined }
export interface Employee extends BaseRecord { name: string; role?: string | undefined; phone?: string | undefined }
/** Genişletilebilir servis durumu. kind davranışı belirler; etiket serbesttir. */
export type StatusKind = "active" | "completed" | "delivered" | "cancelled";
export interface ServiceStatus extends BaseRecord { label: string; kind: StatusKind; order: number; builtin: boolean }
export interface WorkOrder extends BaseRecord { orderNo: string; vehicleId: string; customerId: string; employeeId?: string | undefined; statusId: string; enteredAt: string; expectedAt?: string | undefined; completedAt?: string | undefined; description?: string | undefined; currency: Currency }
export interface WorkOrderItem extends BaseRecord { workOrderId: string; name: string; kind: "part" | "labor"; description?: string | undefined; amount: Money }
export type PaymentMethod = "cash" | "debit_card" | "credit_card" | "transfer" | "other";
/** active: borçtan düşer. cancelled/refunded: kayıt kalır, borçtan düşmez. */
export type PaymentRecordStatus = "active" | "cancelled" | "refunded";
/** Uygulama dışında alınmış bir tahsilatın KAYDI. Her ödeme bir servise bağlıdır; para birimi servisinkiyle aynıdır. */
export interface Payment extends BaseRecord { workOrderId: string; customerId: string; money: Money; method: PaymentMethod; status: PaymentRecordStatus; note?: string | undefined; paidAt: string }
export interface Expense extends BaseRecord { category: string; description?: string | undefined; money: Money; method: PaymentMethod; spentAt: string }
export type SmsStatus = "queued" | "sent" | "failed";
export interface SmsLog extends BaseRecord { customerId?: string; phone: string; message: string; status: SmsStatus; workOrderId?: string | undefined; customerName?: string | undefined; plate?: string | undefined; error?: string | undefined; attempts?: number | undefined; sentAt?: string | undefined }
/** SMS şablonu. isDefault=true olan silinemez/arşivlenemez. */
export interface SmsTemplate extends BaseRecord { name: string; body: string; isDefault: boolean }
export interface Setting extends BaseRecord { key: string; value: string }
export interface AuditLog extends BaseRecord { entity: EntityName; entityId: string; action: "create" | "update" | "archive" | "restore" | "delete"; details?: string }

export interface EntityMap {
  customers: Customer; vehicles: Vehicle; employees: Employee; workOrders: WorkOrder;
  workOrderItems: WorkOrderItem; payments: Payment; expenses: Expense; smsLogs: SmsLog;
  settings: Setting; auditLogs: AuditLog; serviceStatuses: ServiceStatus; smsTemplates: SmsTemplate;
}
export type EntityName = keyof EntityMap;
