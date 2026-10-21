import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function exportToPDF(elementId: string, fileName: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("Element not found:", elementId);
    return;
  }

  try {
    // Create a clone to avoid flickering on the main UI
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = element.offsetWidth + 'px';
    document.body.appendChild(clone);

    // Unhide print:block elements in the clone
    const clonePrintBlocks = clone.querySelectorAll('.print\\:block, [class*="print:block"]');
    clonePrintBlocks.forEach((el: any) => {
      el.classList.remove('hidden');
      el.style.display = 'block';
    });

    // Remove print:hidden elements and buttons from clone
    const cloneHidden = clone.querySelectorAll('.print\\:hidden, button');
    cloneHidden.forEach((el: any) => el.remove());

    // Replace inputs with spans in the clone
    const cloneInputs = clone.querySelectorAll('input, textarea');
    cloneInputs.forEach((input: any) => {
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.remove();
        return;
      }
      const span = document.createElement('span');
      span.textContent = input.value;
      const isTextarea = input.tagName.toLowerCase() === 'textarea';
      if (isTextarea) {
        span.style.display = 'block';
        span.style.width = '100%';
        span.style.whiteSpace = 'pre-wrap';
        span.style.wordBreak = 'break-word';
        span.style.overflowWrap = 'break-word';
        span.style.lineHeight = '1.4';
      } else {
        span.style.display = 'inline-block';
        span.style.wordBreak = 'break-word';
        span.style.overflowWrap = 'break-word';
        if (input.value && input.value.includes('\n')) {
          span.style.display = 'block';
          span.style.width = '100%';
          span.style.whiteSpace = 'pre-wrap';
        }
      }
      span.style.minWidth = '10px';
      span.style.borderBottom = input.style.borderBottom;
      span.className = input.className;
      input.parentNode.replaceChild(span, input);
    });

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    document.body.removeChild(clone);

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${fileName}.pdf`);
  } catch (error) {
    console.error("Error exporting to PDF:", error);
  }
}

export async function exportToImage(elementId: string, fileName: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("Element not found:", elementId);
    return;
  }

  try {
    // Create a clone to avoid flickering on the main UI
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = element.offsetWidth + 'px';
    document.body.appendChild(clone);

    // Unhide print:block elements in the clone
    const clonePrintBlocks = clone.querySelectorAll('.print\\:block, [class*="print:block"]');
    clonePrintBlocks.forEach((el: any) => {
      el.classList.remove('hidden');
      el.style.display = 'block';
    });

    // Remove print:hidden elements and buttons from clone
    const cloneHidden = clone.querySelectorAll('.print\\:hidden, button');
    cloneHidden.forEach((el: any) => el.remove());

    // Replace inputs with spans in the clone
    const cloneInputs = clone.querySelectorAll('input, textarea');
    cloneInputs.forEach((input: any) => {
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.remove();
        return;
      }
      const span = document.createElement('span');
      span.textContent = input.value;
      const isTextarea = input.tagName.toLowerCase() === 'textarea';
      if (isTextarea) {
        span.style.display = 'block';
        span.style.width = '100%';
        span.style.whiteSpace = 'pre-wrap';
        span.style.wordBreak = 'break-word';
        span.style.overflowWrap = 'break-word';
        span.style.lineHeight = '1.4';
      } else {
        span.style.display = 'inline-block';
        span.style.wordBreak = 'break-word';
        span.style.overflowWrap = 'break-word';
        if (input.value && input.value.includes('\n')) {
          span.style.display = 'block';
          span.style.width = '100%';
          span.style.whiteSpace = 'pre-wrap';
        }
      }
      span.style.minWidth = '10px';
      span.style.borderBottom = input.style.borderBottom;
      span.className = input.className;
      input.parentNode.replaceChild(span, input);
    });

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    document.body.removeChild(clone);

    const imgData = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = imgData;
    link.download = `${fileName}.png`;
    link.click();
  } catch (error) {
    console.error("Error exporting to Image:", error);
  }
}
