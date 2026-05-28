// ============================================================
//  drug-data.js — Thai community pharmacy drug list
//  Used to seed Firestore /drugs collection via setup/seed-drugs.js
// ============================================================

const DRUG_SEED = [

  // ── ยาแก้ปวด / ลดไข้ ─────────────────────────────────────
  { drugCode: 'paracetamol_500',   name: 'Paracetamol',        strength: '500mg',       form: 'เม็ด',      category: 'ยาแก้ปวด/ลดไข้',      isOtc: true,  isActive: true },
  { drugCode: 'paracetamol_325',   name: 'Paracetamol',        strength: '325mg',       form: 'เม็ด',      category: 'ยาแก้ปวด/ลดไข้',      isOtc: true,  isActive: true },
  { drugCode: 'ibuprofen_200',     name: 'Ibuprofen',          strength: '200mg',       form: 'เม็ด',      category: 'ยาแก้ปวด/ลดไข้',      isOtc: true,  isActive: true },
  { drugCode: 'ibuprofen_400',     name: 'Ibuprofen',          strength: '400mg',       form: 'เม็ด',      category: 'ยาแก้ปวด/ลดไข้',      isOtc: true,  isActive: true },
  { drugCode: 'mefenamic_500',     name: 'Mefenamic acid',     strength: '500mg',       form: 'แคปซูล',   category: 'ยาแก้ปวด/ลดไข้',      isOtc: false, isActive: true },
  { drugCode: 'mefenamic_250',     name: 'Mefenamic acid',     strength: '250mg',       form: 'แคปซูล',   category: 'ยาแก้ปวด/ลดไข้',      isOtc: false, isActive: true },
  { drugCode: 'naproxen_250',      name: 'Naproxen',           strength: '250mg',       form: 'เม็ด',      category: 'ยาแก้ปวด/ลดไข้',      isOtc: false, isActive: true },
  { drugCode: 'diclofenac_25',     name: 'Diclofenac',         strength: '25mg',        form: 'เม็ด',      category: 'ยาแก้ปวด/ลดไข้',      isOtc: false, isActive: true },
  { drugCode: 'diclofenac_50',     name: 'Diclofenac',         strength: '50mg',        form: 'เม็ด',      category: 'ยาแก้ปวด/ลดไข้',      isOtc: false, isActive: true },
  { drugCode: 'aspirin_300',       name: 'Aspirin',            strength: '300mg',       form: 'เม็ด',      category: 'ยาแก้ปวด/ลดไข้',      isOtc: true,  isActive: true },

  // ── ยาแก้ปวดกล้ามเนื้อ / ตะคริว ──────────────────────────
  { drugCode: 'methocarbamol_500', name: 'Methocarbamol',      strength: '500mg',       form: 'เม็ด',      category: 'ยาคลายกล้ามเนื้อ',     isOtc: false, isActive: true },
  { drugCode: 'orphen_paracet',    name: 'Orphenadrine+Paracetamol', strength: '35+450mg', form: 'เม็ด', category: 'ยาคลายกล้ามเนื้อ',     isOtc: false, isActive: true },

  // ── ยาแก้แพ้ / ต้านฮีสตามีน ──────────────────────────────
  { drugCode: 'cpm_4',             name: 'Chlorpheniramine (CPM)', strength: '4mg',     form: 'เม็ด',      category: 'ยาแก้แพ้',             isOtc: true,  isActive: true },
  { drugCode: 'loratadine_10',     name: 'Loratadine',         strength: '10mg',        form: 'เม็ด',      category: 'ยาแก้แพ้',             isOtc: true,  isActive: true },
  { drugCode: 'cetirizine_10',     name: 'Cetirizine',         strength: '10mg',        form: 'เม็ด',      category: 'ยาแก้แพ้',             isOtc: true,  isActive: true },
  { drugCode: 'fexofenadine_120',  name: 'Fexofenadine',       strength: '120mg',       form: 'เม็ด',      category: 'ยาแก้แพ้',             isOtc: true,  isActive: true },
  { drugCode: 'prednisolone_5',    name: 'Prednisolone',       strength: '5mg',         form: 'เม็ด',      category: 'สเตียรอยด์',           isOtc: false, isActive: true },

  // ── ยาแก้หวัด / คัดจมูก / ไอ ─────────────────────────────
  { drugCode: 'pseudoephedrine_60',name: 'Pseudoephedrine',    strength: '60mg',        form: 'เม็ด',      category: 'ยาแก้หวัด/คัดจมูก',   isOtc: true,  isActive: true },
  { drugCode: 'oxymetazoline_nasal',name:'Oxymetazoline',      strength: '0.05%',       form: 'สเปรย์พ่นจมูก', category: 'ยาแก้หวัด/คัดจมูก', isOtc: true, isActive: true },
  { drugCode: 'bromhexine_8',      name: 'Bromhexine',         strength: '8mg',         form: 'เม็ด',      category: 'ยาละลายเสมหะ',         isOtc: true,  isActive: true },
  { drugCode: 'guaifenesin_200',   name: 'Guaifenesin',        strength: '200mg',       form: 'เม็ด',      category: 'ยาละลายเสมหะ',         isOtc: true,  isActive: true },
  { drugCode: 'dextromethorphan_15',name:'Dextromethorphan',   strength: '15mg',        form: 'เม็ด',      category: 'ยาแก้ไอ',              isOtc: true,  isActive: true },

  // ── ยาปฏิชีวนะ ────────────────────────────────────────────
  { drugCode: 'amoxicillin_500',   name: 'Amoxicillin',        strength: '500mg',       form: 'แคปซูล',   category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'amoxicillin_250',   name: 'Amoxicillin',        strength: '250mg',       form: 'แคปซูล',   category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'amoxiclav_625',     name: 'Amoxicillin/Clavulanate', strength: '625mg',  form: 'เม็ด',      category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'azithromycin_500',  name: 'Azithromycin',       strength: '500mg',       form: 'เม็ด',      category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'azithromycin_250',  name: 'Azithromycin',       strength: '250mg',       form: 'เม็ด',      category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'cefalexin_500',     name: 'Cefalexin',          strength: '500mg',       form: 'แคปซูล',   category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'cloxacillin_500',   name: 'Cloxacillin',        strength: '500mg',       form: 'แคปซูล',   category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'doxycycline_100',   name: 'Doxycycline',        strength: '100mg',       form: 'แคปซูล',   category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'norfloxacin_400',   name: 'Norfloxacin',        strength: '400mg',       form: 'เม็ด',      category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'cotrimoxazole_480', name: 'Cotrimoxazole (TMP-SMX)', strength: '480mg',  form: 'เม็ด',      category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'metronidazole_250', name: 'Metronidazole',      strength: '250mg',       form: 'เม็ด',      category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'metronidazole_400', name: 'Metronidazole',      strength: '400mg',       form: 'เม็ด',      category: 'ยาปฏิชีวนะ',           isOtc: false, isActive: true },
  { drugCode: 'fluconazole_150',   name: 'Fluconazole',        strength: '150mg',       form: 'แคปซูล',   category: 'ยาต้านเชื้อรา',         isOtc: false, isActive: true },
  { drugCode: 'acyclovir_200',     name: 'Acyclovir',          strength: '200mg',       form: 'เม็ด',      category: 'ยาต้านไวรัส',           isOtc: false, isActive: true },
  { drugCode: 'acyclovir_400',     name: 'Acyclovir',          strength: '400mg',       form: 'เม็ด',      category: 'ยาต้านไวรัส',           isOtc: false, isActive: true },

  // ── ยากระเพาะ / กรดไหลย้อน ───────────────────────────────
  { drugCode: 'omeprazole_20',     name: 'Omeprazole',         strength: '20mg',        form: 'แคปซูล',   category: 'ยากระเพาะ/กรดไหลย้อน', isOtc: true,  isActive: true },
  { drugCode: 'omeprazole_40',     name: 'Omeprazole',         strength: '40mg',        form: 'แคปซูล',   category: 'ยากระเพาะ/กรดไหลย้อน', isOtc: false, isActive: true },
  { drugCode: 'esomeprazole_20',   name: 'Esomeprazole',       strength: '20mg',        form: 'แคปซูล',   category: 'ยากระเพาะ/กรดไหลย้อน', isOtc: true,  isActive: true },
  { drugCode: 'famotidine_20',     name: 'Famotidine',         strength: '20mg',        form: 'เม็ด',      category: 'ยากระเพาะ/กรดไหลย้อน', isOtc: true,  isActive: true },
  { drugCode: 'famotidine_40',     name: 'Famotidine',         strength: '40mg',        form: 'เม็ด',      category: 'ยากระเพาะ/กรดไหลย้อน', isOtc: false, isActive: true },
  { drugCode: 'antacid',          name: 'Antacid (Mg+Al hydroxide)', strength: '500mg', form: 'เม็ด/น้ำ',  category: 'ยากระเพาะ/กรดไหลย้อน', isOtc: true,  isActive: true },
  { drugCode: 'sucralfate_1g',     name: 'Sucralfate',         strength: '1g',          form: 'เม็ด/น้ำ',  category: 'ยากระเพาะ/กรดไหลย้อน', isOtc: false, isActive: true },
  { drugCode: 'hyoscine_10',       name: 'Hyoscine butylbromide (Buscopan)', strength: '10mg', form: 'เม็ด', category: 'ยาแก้ปวดเกร็งท้อง', isOtc: false, isActive: true },
  { drugCode: 'simethicone_80',    name: 'Simethicone',        strength: '80mg',        form: 'เม็ด',      category: 'ยาแก้ท้องอืด',         isOtc: true,  isActive: true },
  { drugCode: 'domperidone_10',    name: 'Domperidone',        strength: '10mg',        form: 'เม็ด',      category: 'ยาแก้คลื่นไส้',         isOtc: false, isActive: true },
  { drugCode: 'metoclopramide_10', name: 'Metoclopramide',     strength: '10mg',        form: 'เม็ด',      category: 'ยาแก้คลื่นไส้',         isOtc: false, isActive: true },
  { drugCode: 'dimenhydrinate_50', name: 'Dimenhydrinate',     strength: '50mg',        form: 'เม็ด',      category: 'ยาแก้เมารถ/เมาเรือ',   isOtc: true,  isActive: true },
  { drugCode: 'betahistine_8',     name: 'Betahistine',        strength: '8mg',         form: 'เม็ด',      category: 'ยาแก้เวียนศีรษะ',       isOtc: false, isActive: true },
  { drugCode: 'betahistine_16',    name: 'Betahistine',        strength: '16mg',        form: 'เม็ด',      category: 'ยาแก้เวียนศีรษะ',       isOtc: false, isActive: true },

  // ── ยาแก้ท้องเสีย / ท้องผูก ──────────────────────────────
  { drugCode: 'loperamide_2',      name: 'Loperamide',         strength: '2mg',         form: 'แคปซูล',   category: 'ยาแก้ท้องเสีย',         isOtc: true,  isActive: true },
  { drugCode: 'ors',               name: 'ORS (เกลือแร่)',     strength: '-',           form: 'ผงละลายน้ำ', category: 'ยาแก้ท้องเสีย',        isOtc: true,  isActive: true },
  { drugCode: 'activated_charcoal',name: 'Activated Charcoal', strength: '200mg',       form: 'เม็ด',      category: 'ยาแก้ท้องเสีย',         isOtc: true,  isActive: true },
  { drugCode: 'bisacodyl_5',       name: 'Bisacodyl',          strength: '5mg',         form: 'เม็ด',      category: 'ยาระบาย',                isOtc: true,  isActive: true },
  { drugCode: 'lactulose',         name: 'Lactulose',          strength: '3.35g/5ml',   form: 'น้ำเชื่อม', category: 'ยาระบาย',               isOtc: true,  isActive: true },

  // ── ยาแก้เจ็บคอ ───────────────────────────────────────────
  { drugCode: 'lozenges_benzocaine',name:'Benzocaine Lozenges',strength: '10mg',        form: 'เม็ดอม',    category: 'ยาแก้เจ็บคอ',           isOtc: true,  isActive: true },
  { drugCode: 'lozenges_antiseptic',name:'Antiseptic Lozenges',strength: '-',           form: 'เม็ดอม',    category: 'ยาแก้เจ็บคอ',           isOtc: true,  isActive: true },
  { drugCode: 'strepsils',          name:'Strepsils',          strength: '-',           form: 'เม็ดอม',    category: 'ยาแก้เจ็บคอ',           isOtc: true,  isActive: true },

  // ── ยาทาภายนอก / ผิวหนัง ─────────────────────────────────
  { drugCode: 'hydrocortisone_1pct',name:'Hydrocortisone cream',strength: '1%',         form: 'ครีม',      category: 'ยาทาผิวหนัง',           isOtc: true,  isActive: true },
  { drugCode: 'clotrimazole_1pct',  name:'Clotrimazole cream', strength: '1%',         form: 'ครีม',      category: 'ยาทาผิวหนัง/ต้านเชื้อรา', isOtc: true, isActive: true },
  { drugCode: 'ketoconazole_2pct',  name:'Ketoconazole cream', strength: '2%',         form: 'ครีม',      category: 'ยาทาผิวหนัง/ต้านเชื้อรา', isOtc: true, isActive: true },
  { drugCode: 'mupirocin_2pct',     name:'Mupirocin ointment', strength: '2%',         form: 'ขี้ผึ้ง',  category: 'ยาทาผิวหนัง/ปฏิชีวนะ',  isOtc: false, isActive: true },
  { drugCode: 'acyclovir_cream',    name:'Acyclovir cream',    strength: '5%',         form: 'ครีม',      category: 'ยาทาผิวหนัง/ต้านไวรัส', isOtc: false, isActive: true },
  { drugCode: 'nystatin_oral',      name:'Nystatin',           strength: '500,000 IU', form: 'เม็ด/น้ำแขวนตะกอน', category: 'ยาต้านเชื้อราในช่องปาก', isOtc: false, isActive: true },
  { drugCode: 'diclofenac_gel',     name:'Diclofenac gel',     strength: '1%',         form: 'เจล',       category: 'ยาทาแก้ปวด',             isOtc: true,  isActive: true },
  { drugCode: 'calamine_lotion',    name:'Calamine lotion',    strength: '-',          form: 'โลชั่น',   category: 'ยาทาแก้คัน',             isOtc: true,  isActive: true },
  { drugCode: 'povidone_iodine',    name:'Povidone-Iodine solution', strength: '10%',  form: 'น้ำยา',    category: 'น้ำยาล้างแผล',           isOtc: true,  isActive: true },

  // ── วิตามิน / แร่ธาตุ ─────────────────────────────────────
  { drugCode: 'vit_c_1000',        name: 'Vitamin C',          strength: '1000mg',      form: 'เม็ด',      category: 'วิตามิน/อาหารเสริม',    isOtc: true,  isActive: true },
  { drugCode: 'vit_c_500',         name: 'Vitamin C',          strength: '500mg',       form: 'เม็ด',      category: 'วิตามิน/อาหารเสริม',    isOtc: true,  isActive: true },
  { drugCode: 'b_complex',         name: 'Vitamin B-complex',  strength: '-',           form: 'เม็ด',      category: 'วิตามิน/อาหารเสริม',    isOtc: true,  isActive: true },
  { drugCode: 'vit_b1_100',        name: 'Thiamine (Vitamin B1)', strength: '100mg',   form: 'เม็ด',      category: 'วิตามิน/อาหารเสริม',    isOtc: true,  isActive: true },
  { drugCode: 'zinc_10',           name: 'Zinc',               strength: '10mg',        form: 'เม็ด',      category: 'วิตามิน/อาหารเสริม',    isOtc: true,  isActive: true },
  { drugCode: 'ferrous_200',       name: 'Ferrous fumarate',   strength: '200mg',       form: 'เม็ด',      category: 'วิตามิน/อาหารเสริม',    isOtc: true,  isActive: true },
  { drugCode: 'calcium_600',       name: 'Calcium carbonate',  strength: '600mg',       form: 'เม็ด',      category: 'วิตามิน/อาหารเสริม',    isOtc: true,  isActive: true },
];

const DRUG_CATEGORIES = [...new Set(DRUG_SEED.map(d => d.category))];

function searchDrugs(keyword, drugs) {
  const list = drugs || DRUG_SEED;
  const q = (keyword || '').toLowerCase().trim();
  if (!q) return list;
  return list.filter(d =>
    d.name.toLowerCase().includes(q) ||
    d.category.toLowerCase().includes(q) ||
    d.strength.toLowerCase().includes(q)
  );
}
