// ============================================================
//  drug-data.js — seed data ported from drug_list.js
//  Used to seed Firestore /drugs collection on first setup
// ============================================================

const DRUG_SEED = [
  // ยาแก้ปวด / ลดไข้
  { drugCode: 'paracetamol_500', name: 'Paracetamol', strength: '500mg', form: 'เม็ด', category: 'ยาแก้ปวด/ลดไข้', isOtc: true, isActive: true },
  { drugCode: 'paracetamol_325', name: 'Paracetamol', strength: '325mg', form: 'เม็ด', category: 'ยาแก้ปวด/ลดไข้', isOtc: true, isActive: true },
  { drugCode: 'ibuprofen_200',   name: 'Ibuprofen',   strength: '200mg', form: 'เม็ด', category: 'ยาแก้ปวด/ลดไข้', isOtc: true, isActive: true },
  { drugCode: 'ibuprofen_400',   name: 'Ibuprofen',   strength: '400mg', form: 'เม็ด', category: 'ยาแก้ปวด/ลดไข้', isOtc: true, isActive: true },
  { drugCode: 'aspirin_300',     name: 'Aspirin',     strength: '300mg', form: 'เม็ด', category: 'ยาแก้ปวด/ลดไข้', isOtc: true, isActive: true },
  { drugCode: 'naproxen_250',    name: 'Naproxen',    strength: '250mg', form: 'เม็ด', category: 'ยาแก้ปวด/ลดไข้', isOtc: true, isActive: true },
  { drugCode: 'diclofenac_25',   name: 'Diclofenac',  strength: '25mg',  form: 'เม็ด', category: 'ยาแก้ปวด/ลดไข้', isOtc: false, isActive: true },

  // ยาแก้แพ้
  { drugCode: 'cpm_4',             name: 'Chlorpheniramine (CPM)', strength: '4mg',   form: 'เม็ด', category: 'ยาแก้แพ้', isOtc: true, isActive: true },
  { drugCode: 'loratadine_10',     name: 'Loratadine',             strength: '10mg',  form: 'เม็ด', category: 'ยาแก้แพ้', isOtc: true, isActive: true },
  { drugCode: 'cetirizine_10',     name: 'Cetirizine',             strength: '10mg',  form: 'เม็ด', category: 'ยาแก้แพ้', isOtc: true, isActive: true },
  { drugCode: 'fexofenadine_120',  name: 'Fexofenadine',           strength: '120mg', form: 'เม็ด', category: 'ยาแก้แพ้', isOtc: true, isActive: true },

  // ยาแก้หวัด / ละลายเสมหะ
  { drugCode: 'pseudoephedrine_60', name: 'Pseudoephedrine', strength: '60mg',  form: 'เม็ด', category: 'ยาแก้หวัด',            isOtc: true, isActive: true },
  { drugCode: 'bromhexine_8',       name: 'Bromhexine',       strength: '8mg',   form: 'เม็ด', category: 'ยาแก้หวัด/ละลายเสมหะ', isOtc: true, isActive: true },
  { drugCode: 'guaifenesin_200',    name: 'Guaifenesin',      strength: '200mg', form: 'เม็ด', category: 'ยาแก้หวัด/ละลายเสมหะ', isOtc: true, isActive: true },
  { drugCode: 'dextromethorphan_15',name: 'Dextromethorphan', strength: '15mg',  form: 'เม็ด', category: 'ยาแก้ไอ',              isOtc: true, isActive: true },

  // ยาปฏิชีวนะ
  { drugCode: 'amoxicillin_500',  name: 'Amoxicillin',             strength: '500mg', form: 'แคปซูล', category: 'ยาปฏิชีวนะ', isOtc: false, isActive: true },
  { drugCode: 'amoxicillin_250',  name: 'Amoxicillin',             strength: '250mg', form: 'แคปซูล', category: 'ยาปฏิชีวนะ', isOtc: false, isActive: true },
  { drugCode: 'amoxiclav_625',    name: 'Amoxicillin/Clavulanate', strength: '625mg', form: 'เม็ด',    category: 'ยาปฏิชีวนะ', isOtc: false, isActive: true },
  { drugCode: 'azithromycin_250', name: 'Azithromycin',            strength: '250mg', form: 'เม็ด',    category: 'ยาปฏิชีวนะ', isOtc: false, isActive: true },
  { drugCode: 'azithromycin_500', name: 'Azithromycin',            strength: '500mg', form: 'เม็ด',    category: 'ยาปฏิชีวนะ', isOtc: false, isActive: true },
  { drugCode: 'cefalexin_500',    name: 'Cefalexin',               strength: '500mg', form: 'แคปซูล', category: 'ยาปฏิชีวนะ', isOtc: false, isActive: true },
  { drugCode: 'doxycycline_100',  name: 'Doxycycline',             strength: '100mg', form: 'แคปซูล', category: 'ยาปฏิชีวนะ', isOtc: false, isActive: true },
  { drugCode: 'norfloxacin_400',  name: 'Norfloxacin',             strength: '400mg', form: 'เม็ด',    category: 'ยาปฏิชีวนะ', isOtc: false, isActive: true },

  // ระบบทางเดินอาหาร
  { drugCode: 'omeprazole_20',       name: 'Omeprazole',               strength: '20mg',     form: 'แคปซูล',     category: 'ยากระเพาะ/กรดไหลย้อน', isOtc: true,  isActive: true },
  { drugCode: 'ranitidine_150',      name: 'Ranitidine',               strength: '150mg',    form: 'เม็ด',        category: 'ยากระเพาะ/กรดไหลย้อน', isOtc: true,  isActive: true },
  { drugCode: 'antacid',             name: 'Antacid (Mg+Al hydroxide)',strength: '500mg',    form: 'เม็ด/น้ำ',    category: 'ยากระเพาะ/กรดไหลย้อน', isOtc: true,  isActive: true },
  { drugCode: 'domperidone_10',      name: 'Domperidone',              strength: '10mg',     form: 'เม็ด',        category: 'ยาแก้คลื่นไส้',         isOtc: false, isActive: true },
  { drugCode: 'metoclopramide_10',   name: 'Metoclopramide',           strength: '10mg',     form: 'เม็ด',        category: 'ยาแก้คลื่นไส้',         isOtc: false, isActive: true },
  { drugCode: 'loperamide_2',        name: 'Loperamide',               strength: '2mg',      form: 'แคปซูล',     category: 'ยาแก้ท้องเสีย',         isOtc: true,  isActive: true },
  { drugCode: 'ors',                 name: 'ORS (เกลือแร่)',            strength: '-',        form: 'ผงละลายน้ำ',  category: 'ยาแก้ท้องเสีย',         isOtc: true,  isActive: true },
  { drugCode: 'bisacodyl_5',         name: 'Bisacodyl',                strength: '5mg',      form: 'เม็ด',        category: 'ยาระบาย',                isOtc: true,  isActive: true },
  { drugCode: 'lactulose',           name: 'Lactulose',                strength: '3.35g/5ml',form: 'น้ำเชื่อม',   category: 'ยาระบาย',                isOtc: true,  isActive: true },
  { drugCode: 'activated_charcoal',  name: 'Activated Charcoal',       strength: '200mg',    form: 'เม็ด',        category: 'ยาแก้ท้องเสีย/ดูดซับสารพิษ', isOtc: true, isActive: true },
  { drugCode: 'zinc_10',             name: 'Zinc',                     strength: '10mg',     form: 'เม็ด',        category: 'วิตามิน',                isOtc: true,  isActive: true },

  // ยาแก้เจ็บคอ
  { drugCode: 'lozenges_benzocaine', name: 'Benzocaine Lozenges', strength: '10mg', form: 'เม็ดอม', category: 'ยาแก้เจ็บคอ', isOtc: true, isActive: true },
  { drugCode: 'lozenges_antiseptic', name: 'Antiseptic Lozenges', strength: '-',    form: 'เม็ดอม', category: 'ยาแก้เจ็บคอ', isOtc: true, isActive: true },
  { drugCode: 'strepsils',           name: 'Strepsils',           strength: '-',    form: 'เม็ดอม', category: 'ยาแก้เจ็บคอ', isOtc: true, isActive: true },

  // ยาทาภายนอก
  { drugCode: 'hydrocortisone_1pct', name: 'Hydrocortisone cream',   strength: '1%', form: 'ครีม',   category: 'ยาทาผิวหนัง', isOtc: true,  isActive: true },
  { drugCode: 'clotrimazole_1pct',   name: 'Clotrimazole cream',     strength: '1%', form: 'ครีม',   category: 'ยาทาผิวหนัง', isOtc: true,  isActive: true },
  { drugCode: 'mupirocin_2pct',      name: 'Mupirocin ointment',     strength: '2%', form: 'ขี้ผึ้ง', category: 'ยาทาผิวหนัง', isOtc: false, isActive: true },
  { drugCode: 'diclofenac_gel',      name: 'Diclofenac gel',         strength: '1%', form: 'เจล',    category: 'ยาทาแก้ปวด',  isOtc: true,  isActive: true },
  { drugCode: 'povidone_iodine',     name: 'Povidone-Iodine solution',strength: '10%',form: 'น้ำยา', category: 'ยาล้างแผล',   isOtc: true,  isActive: true },

  // วิตามิน
  { drugCode: 'vit_c_1000', name: 'Vitamin C', strength: '1000mg', form: 'เม็ด', category: 'วิตามิน', isOtc: true, isActive: true },
  { drugCode: 'vit_c_500',  name: 'Vitamin C', strength: '500mg',  form: 'เม็ด', category: 'วิตามิน', isOtc: true, isActive: true },
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
