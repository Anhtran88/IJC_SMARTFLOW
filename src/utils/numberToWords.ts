export function numberToVietnameseWords(num: number): string {
  if (num === 0) return "Không đồng";
  
  const units = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const subgroups = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  
  let result = "";
  
  function readThreeDigits(n: number, isLastGroup: boolean): string {
    let text = "";
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;
    const tens = Math.floor(remainder / 10);
    const ones = remainder % 10;
    
    if (hundreds > 0) {
      text += units[hundreds] + " trăm ";
    } else if (!isLastGroup) {
      text += "không trăm ";
    }
    
    if (tens > 0) {
      if (tens === 1) {
        text += "mười ";
      } else {
        text += units[tens] + " mươi ";
      }
    } else if (ones > 0 && (hundreds > 0 || !isLastGroup)) {
      text += "lẻ ";
    }
    
    if (ones > 0) {
      if (ones === 1 && tens > 1) {
        text += "mốt ";
      } else if (ones === 5 && tens > 0) {
        text += "lăm ";
      } else {
        text += units[ones] + " ";
      }
    }
    
    return text;
  }
  
  let count = 0;
  let remaining = num;
  while (remaining > 0) {
    const chunk = remaining % 1000;
    remaining = Math.floor(remaining / 1000);
    
    if (chunk > 0) {
      const chunkText = readThreeDigits(chunk, remaining === 0);
      result = chunkText + subgroups[count] + " " + result;
    }
    count++;
  }
  
  let words = result.trim().replace(/\s+/g, " ");
  if (words.length > 0) {
    words = words.charAt(0).toUpperCase() + words.slice(1) + " đồng";
  }
  return words;
}
