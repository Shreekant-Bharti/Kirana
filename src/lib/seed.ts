import { db, todayDDMMYYYY } from "./db";

interface SeedTx {
  item: string;
  price: number;
  daysAgo: number;
}

interface SeedCustomer {
  name: string;
  txs: SeedTx[];
}

const DEMO: SeedCustomer[] = [
  {
    name: "Ramesh Kumar",
    txs: [
      { item: "Rice 5kg", price: 350, daysAgo: 12 },
      { item: "Sugar 2kg", price: 90, daysAgo: 10 },
      { item: "Cash Payment", price: -200, daysAgo: 5 },
      { item: "Cooking Oil 1L", price: 180, daysAgo: 2 },
    ],
  },
  {
    name: "Suresh Patel",
    txs: [
      { item: "Cement Bag", price: 420, daysAgo: 20 },
      { item: "Paint 4L", price: 850, daysAgo: 15 },
      { item: "Cash Payment", price: -500, daysAgo: 7 },
    ],
  },
  {
    name: "Anita Sharma",
    txs: [
      { item: "Milk 2L", price: 120, daysAgo: 8 },
      { item: "Bread", price: 40, daysAgo: 6 },
      { item: "Eggs 1 dozen", price: 90, daysAgo: 3 },
      { item: "Cash Payment", price: -250, daysAgo: 1 },
    ],
  },
  {
    name: "Vikas Singh",
    txs: [
      { item: "Paracetamol", price: 45, daysAgo: 4 },
      { item: "Cough Syrup", price: 130, daysAgo: 4 },
      { item: "Bandage", price: 60, daysAgo: 2 },
    ],
  },
  {
    name: "Priya Verma",
    txs: [
      { item: "Notebook set", price: 220, daysAgo: 30 },
      { item: "Pens box", price: 150, daysAgo: 30 },
      { item: "Cash Payment", price: -370, daysAgo: 25 },
    ],
  },
  {
    name: "Mohan Lal",
    txs: [
      { item: "Atta 10kg", price: 480, daysAgo: 14 },
      { item: "Dal 2kg", price: 260, daysAgo: 14 },
      { item: "Tea 500g", price: 220, daysAgo: 9 },
      { item: "Cash Payment", price: -400, daysAgo: 6 },
      { item: "Biscuits", price: 80, daysAgo: 1 },
    ],
  },
  {
    name: "Kavita Joshi",
    txs: [
      { item: "Shampoo", price: 180, daysAgo: 5 },
      { item: "Soap pack", price: 120, daysAgo: 5 },
    ],
  },
  {
    name: "Deepak Yadav",
    txs: [
      { item: "Wire 10m", price: 340, daysAgo: 18 },
      { item: "Bulbs x4", price: 280, daysAgo: 18 },
      { item: "Switch board", price: 190, daysAgo: 10 },
      { item: "Cash Payment", price: -600, daysAgo: 3 },
    ],
  },
];

function dateNDaysAgo(days: number): { str: string; ts: number } {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return { str: todayDDMMYYYY(d), ts: d.getTime() };
}

export async function loadDemoData(): Promise<{ customers: number; transactions: number }> {
  let cCount = 0;
  let tCount = 0;
  await db.transaction("rw", db.customers, db.transactions, async () => {
    for (const c of DEMO) {
      const exists = await db.customers.where("name").equals(c.name).first();
      if (exists) continue;
      const createdAt = Date.now() - 1000 * 60 * 60 * 24 * 30;
      const id = await db.customers.add({ name: c.name, createdAt });
      cCount++;
      let serial = 1;
      const sorted = [...c.txs].sort((a, b) => b.daysAgo - a.daysAgo);
      for (const t of sorted) {
        const { str, ts } = dateNDaysAgo(t.daysAgo);
        await db.transactions.add({
          customerId: id,
          serial: serial++,
          item: t.item,
          price: t.price,
          date: str,
          createdAt: ts,
        });
        tCount++;
      }
    }
  });
  return { customers: cCount, transactions: tCount };
}
