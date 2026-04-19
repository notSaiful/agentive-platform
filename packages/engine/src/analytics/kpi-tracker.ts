interface LeadTimeData {
  firstResponseAt: Date | null;
  createdAt: Date;
  status: string;
  classification: string | null;
}

interface KPIs {
  medianFirstResponseSeconds: number | null;
  conversationStartRate: number;
  qualifiedLeadRate: number;
  appointmentBookingRate: number;
  totalLeads: number;
}

export function calculateKPIs(leads: LeadTimeData[]): KPIs {
  const totalLeads = leads.length;
  if (totalLeads === 0) {
    return { medianFirstResponseSeconds: null, conversationStartRate: 0, qualifiedLeadRate: 0, appointmentBookingRate: 0, totalLeads: 0 };
  }

  const responseTimes = leads
    .filter(l => l.firstResponseAt)
    .map(l => (l.firstResponseAt!.getTime() - l.createdAt.getTime()) / 1000)
    .sort((a, b) => a - b);

  const medianFirstResponseSeconds = responseTimes.length > 0
    ? responseTimes[Math.floor(responseTimes.length / 2)]
    : null;

  const contacted = leads.filter(l => l.status !== 'new').length;
  const qualified = leads.filter(l => ['qualified', 'appointment_booked', 'nurture'].includes(l.status)).length;
  const booked = leads.filter(l => l.status === 'appointment_booked').length;

  return {
    medianFirstResponseSeconds,
    conversationStartRate: contacted / totalLeads,
    qualifiedLeadRate: qualified / totalLeads,
    appointmentBookingRate: booked / totalLeads,
    totalLeads,
  };
}