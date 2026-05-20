// utils.js

/**
 * Formats a duration in seconds into a MM:SS string.
 * @param {number} seconds 
 * @param {string} doneLabel - Label to show when time reaches zero
 * @returns {string}
 */
export const formatTime = (seconds, doneLabel = "🔥 HOTOVO") => {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    if (totalSeconds === 0) return doneLabel;
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatQty = (q) => {
    if (q === 0.5) return '1/2';
    if (q === 0.25) return '1/4';
    if (q === 0.75) return '3/4';
    if (q === 1.5) return '1 1/2';
    return q;
};