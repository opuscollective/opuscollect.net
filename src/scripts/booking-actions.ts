/** Accept / decline / cancel buttons on business booking lists. Cancelling asks for a reason, which the customer sees. */
export function bindBookingActions() {
  document.querySelectorAll<HTMLButtonElement>('[data-booking] [data-act]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest<HTMLElement>('[data-booking]')!.dataset.booking;
    const action = b.dataset.act!;
    let note = '';
    if (action === 'decline') note = prompt('Optional note to the customer (for example, a time that works instead):') ?? '';
    if (action === 'cancel') {
      const n = prompt('Why are you cancelling? The customer will see this.');
      if (n === null) return;
      note = n;
    }
    b.disabled = true;
    const r = await fetch(`/api/bookings/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, note }) });
    if (r.ok) location.reload();
    else { b.disabled = false; alert((await r.json().catch(() => ({}))).error ?? 'Something went wrong.'); }
  }));
}
