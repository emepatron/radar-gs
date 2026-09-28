export function enrichSummary(confirmed: number, unconfirmed: number, skipped: number): string {
  if (confirmed + unconfirmed === 0) {
    return "Nenhum lead novo para cruzar. Os qualificados deste filtro já foram enriquecidos.";
  }
  const skip = skipped > 0 ? ` ${skipped} já tinham sido cruzados.` : "";
  return `${confirmed} entraram em Enriquecidos. ${unconfirmed} ficaram sem confirmação.${skip}`;
}
