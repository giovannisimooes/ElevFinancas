import type { Cents } from "./money";
import type { ISODate, MonthKey } from "./dates";

export type Profile = "pessoal" | "elev";
export type ProfileView = Profile | "geral";

export const PROFILE_LABEL: Record<ProfileView, string> = { pessoal: "Pessoal", elev: "ELEV", geral: "Visão geral" };

/** Lançamento avulso: entrada, despesa ou transferência entre perfis. */
export interface Tx {
  id: string;
  type: "income" | "expense" | "transfer";
  description: string;
  amountCents: Cents;
  date: ISODate;            // data da compra / vencimento / recebimento previsto
  status: "paid" | "pending";
  paidDate: ISODate | null; // saída/entrada efetiva de dinheiro
  category: string;
  origin?: string;          // origem da receita
  method: string;           // forma de pagamento/recebimento
  cardId?: string | null;   // quando no crédito
  profile: Profile;         // perfil dono (em transferências: perfil de origem)
  toProfile?: Profile;      // transferências
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Occurrence {
  status?: "paid";
  paidDate?: ISODate;
  amountCents?: Cents;  // valor específico deste mês (edição de um mês ou valor pago)
  dueDate?: ISODate;    // vencimento alterado só neste mês
  skipped?: boolean;    // excluído só neste mês
  notes?: string;
}

/** Conta recorrente mensal (despesa fixa ou receita mensal). */
export interface Recurring {
  id: string;
  kind: "income" | "expense";
  description: string;
  category: string;
  origin?: string;
  method: string;
  cardId?: string | null;
  profile: Profile;
  notes?: string;
  dueDay: number;               // 1..31
  startDate: ISODate;
  endDate?: ISODate | null;
  values: { from: MonthKey; amountCents: Cents }[]; // histórico de valores, ordenado
  occurrences: Record<MonthKey, Occurrence>;
  fixed?: boolean;              // conta como despesa fixa nos relatórios (padrão true)
  createdAt: string;
  updatedAt: string;
}

export interface InstallmentPayment { paidDate: ISODate | null; pre?: boolean }

export interface InstallmentPlan {
  id: string;
  description: string;
  category: string;
  installmentCents: Cents;
  total: number;
  firstDueDate: ISODate;        // vencimento da parcela 1 (calculado)
  dueDay: number;
  method: string;
  cardId?: string | null;
  profile: Profile;
  notes?: string;
  payments: Record<string, InstallmentPayment>; // nº da parcela → pagamento
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
  limitCents?: Cents | null;
  profile: Profile;
  invoices: Record<MonthKey, { paidDate: ISODate; amountCents: Cents }>; // mês de vencimento da fatura
  createdAt: string;
  updatedAt: string;
}

export interface GoalEntry { id: string; date: ISODate; amountCents: Cents; kind: "reserved" | "planned"; note?: string }

export interface Goal {
  id: string;
  name: string;
  kind: "acumulo" | "mensal"; // acúmulo de reserva ou meta de resultado do mês
  targetCents: Cents;
  deadline?: ISODate | null;
  category: string;
  profile: Profile;
  entries: GoalEntry[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  theme: "light" | "dark";
  primary: string;
  chartColors: string[];
  chartStyle: { donut: boolean; rounded: boolean; grid: boolean; animate: boolean };
  compact: boolean;
  initialBalance: Record<Profile, { amountCents: Cents; date: ISODate | null }>;
  incomeCategories: string[];
  expenseCategories: string[];
  methods: string[];
  defaultProfile: ProfileView;
  layout?: LayoutSettings;
}

export interface NavItemCfg { id: string; label?: string; hidden?: boolean }
export interface DashBlockCfg { id: string; span: number; height?: "sm" | "md" | "lg"; hidden?: boolean }
export interface LayoutSettings { nav?: NavItemCfg[]; dash?: DashBlockCfg[] }

export interface TrashItem { id: string; kind: string; deletedAt: string; record: any; label: string }

/** Estado completo, como guardado. */
export interface AppData {
  settings: Settings;
  txs: Record<string, Tx>;
  recurring: Record<string, Recurring>;
  installments: Record<string, InstallmentPlan>;
  cards: Record<string, Card>;
  goals: Record<string, Goal>;
  trash: TrashItem[];
}

/** Item calculado (ocorrência concreta) usado em listas, gráficos e calendário. */
export interface Item {
  key: string;              // único e estável
  source: "tx" | "rec" | "inst" | "invoice";
  refId: string;
  occ?: string;             // mês (rec) ou nº da parcela (inst) ou mês da fatura
  type: "income" | "expense" | "transfer" | "invoice";
  description: string;
  category: string;
  origin?: string;
  method: string;
  cardId?: string | null;
  profile: Profile;
  toProfile?: Profile;
  amountCents: Cents;
  date: ISODate;            // vencimento / data da compra
  competence: MonthKey;     // mês em que pesa no orçamento (crédito: mês da fatura)
  invoiceMonth?: MonthKey;  // crédito: fatura onde cai
  status: "paid" | "pending";
  paidDate: ISODate | null;
  isCredit: boolean;        // vinculada a cartão → saída de caixa ocorre na fatura
  pre?: boolean;            // pago antes do cadastro (não mexe no saldo)
  fixed: boolean;           // despesa fixa (recorrente) x variável
  notes?: string;
  installmentNo?: number;
  installmentTotal?: number;
}

export const DEFAULT_CHART_COLORS = ["#12A150", "#0EA5E9", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6", "#EC4899", "#64748B", "#84CC16", "#F97316"];

export function defaultSettings(): Settings {
  return {
    theme: "light",
    primary: "#12A150",
    chartColors: [...DEFAULT_CHART_COLORS],
    chartStyle: { donut: true, rounded: true, grid: true, animate: true },
    compact: false,
    initialBalance: { pessoal: { amountCents: 0, date: null }, elev: { amountCents: 0, date: null } },
    incomeCategories: ["Clientes / Serviços", "Mensalidade de cliente", "Pró-labore / Salário", "Comissões de afiliado", "Vendas", "Reembolsos", "Rendimentos", "Outros"],
    expenseCategories: ["Alimentação", "Supermercado", "Combustível", "Transporte", "Farmácia", "Saúde", "Lazer", "Compras", "Moradia", "Energia / Água / Internet", "Assinaturas", "Ferramentas / Software", "Marketing", "Educação", "Impostos", "Fornecedores", "Outros"],
    methods: ["Pix", "Débito", "Crédito", "Dinheiro", "Boleto", "Transferência"],
    defaultProfile: "geral",
  };
}

export function emptyData(): AppData {
  return { settings: defaultSettings(), txs: {}, recurring: {}, installments: {}, cards: {}, goals: {}, trash: [] };
}

export function uid(prefix: string): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${r}`;
}

export function nowStamp(): string { return new Date().toISOString(); }
