export function maskSensitiveText(value) {
  if (value == null) return "";
  let text = String(value);
  text = text.replace(/智慧发射场系统/g, "ZHFSCXT");
  text = text.replace(/加注供气系统/g, "JZGQXT");
  text = text.replace(/加注供气/g, "JZGQ");
  text = text.replace(/发射日/g, "FSR");
  text = text.replace(/发射场/g, "FSC");
  text = text.replace(/特燃特气/g, "TKTQ");
  text = text.replace(/长征([一二三四五六七八九十百千万0-9A-Za-z]+)号/g, "CZ$1号");
  text = text.replace(/氦气/g, "HQ");
  text = text.replace(/火箭/g, "HJ");
  text = text.replace(/推进剂/g, "TJ");
  text = text.replace(/特气/g, "TQ");
  text = text.replace(/供气/g, "GQ");
  text = text.replace(/发射/g, "FS");
  text = text.replace(/加注/g, "JZ");
  return text;
}
