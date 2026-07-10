import React, { useRef } from 'react';

export default function OtpSplitInput({ value = '', onChange, disabled = false }) {
  const inputsRef = useRef([]);

  // Convert the string value into an array of 6 characters
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  const handleChange = (e, index) => {
    const val = e.target.value.replace(/[^0-9]/g, ''); // numbers only
    if (!val) {
      // If backspacing or clearing
      const newDigits = [...digits];
      newDigits[index] = '';
      onChange(newDigits.join(''));
      return;
    }

    const newDigits = [...digits];
    newDigits[index] = val.slice(-1); // Take only the last entered digit
    const newValue = newDigits.join('');
    onChange(newValue);

    // Auto-focus next input if not the last one
    if (index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      const newDigits = [...digits];
      if (digits[index] === '') {
        // If current box is already empty, delete previous box value and focus it
        if (index > 0) {
          newDigits[index - 1] = '';
          onChange(newDigits.join(''));
          inputsRef.current[index - 1]?.focus();
        }
      } else {
        // Just clear current box value
        newDigits[index] = '';
        onChange(newDigits.join(''));
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (pastedText.length === 6) {
      onChange(pastedText);
      inputsRef.current[5]?.focus();
    }
  };

  return (
    <div className="flex justify-center gap-2" onPaste={handlePaste}>
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => (inputsRef.current[idx] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(e, idx)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          disabled={disabled}
          className="w-12 h-12 text-center text-xl font-bold bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all select-all disabled:opacity-50 disabled:cursor-not-allowed"
        />
      ))}
    </div>
  );
}
