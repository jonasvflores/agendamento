// ===========================================================
// Biblioteca Príncipe da Paz — agendamento de horários
// ===========================================================

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const PURPOSE_LABELS = {
  estudar: "Estudar",
  trabalho: "Trabalho em grupo",
  aula: "Dar aula",
};

// ---------- Elements ----------

const form = document.getElementById("booking-form");
const nameInput = document.getElementById("name");
const purposeSelect = document.getElementById("purpose");
const purposeOtherField = document.getElementById("purpose-other-field");
const purposeOtherInput = document.getElementById("purpose-other");
const dateInput = document.getElementById("date");
const startTimeInput = document.getElementById("start-time");
const endTimeInput = document.getElementById("end-time");
const formMessage = document.getElementById("form-message");
const submitButton = document.getElementById("submit-button");
const refreshButton = document.getElementById("refresh-button");
const bookingsStatus = document.getElementById("bookings-status");
const bookingsList = document.getElementById("bookings-list");

// ---------- Setup ----------

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

dateInput.min = todayISO();
dateInput.value = todayISO();

purposeSelect.addEventListener("change", () => {
  const isOther = purposeSelect.value === "outro";
  purposeOtherField.hidden = !isOther;
  purposeOtherInput.required = isOther;
  if (!isOther) purposeOtherInput.value = "";
});

// ---------- Helpers ----------

function showMessage(text, tone) {
  formMessage.textContent = text;
  formMessage.hidden = false;
  formMessage.dataset.tone = tone || "error";
}

function hideMessage() {
  formMessage.hidden = true;
}

function formatTime(t) {
  // "14:30:00" -> "14:30"
  return t.slice(0, 5);
}

function formatDateLabel(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const label = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function purposeLabel(booking) {
  if (booking.purpose === "outro") {
    return booking.purpose_other && booking.purpose_other.trim()
      ? booking.purpose_other
      : "Outro motivo";
  }
  return PURPOSE_LABELS[booking.purpose] || booking.purpose;
}

// ---------- Submit new booking ----------

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage();

  const name = nameInput.value.trim();
  const purpose = purposeSelect.value;
  const purposeOther = purposeOtherInput.value.trim();
  const bookingDate = dateInput.value;
  const startTime = startTimeInput.value;
  const endTime = endTimeInput.value;

  if (!name || !purpose || !bookingDate || !startTime || !endTime) {
    showMessage("Preencha todos os campos.");
    return;
  }
  if (purpose === "outro" && !purposeOther) {
    showMessage("Descreva o motivo do agendamento.");
    return;
  }
  if (endTime <= startTime) {
    showMessage("O horário de término precisa ser depois do início.");
    return;
  }

  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Verificando horário…";

  try {
    // Verifica se já existe algum agendamento que conflite nesse mesmo dia
    const { data: existing, error: fetchError } = await supabase
      .from("bookings")
      .select("start_time, end_time")
      .eq("booking_date", bookingDate);

    if (fetchError) throw fetchError;

    const hasConflict = (existing || []).some((b) => {
      return startTime < b.end_time.slice(0, 5) && endTime > b.start_time.slice(0, 5);
    });

    if (hasConflict) {
      showMessage("Já existe um agendamento nesse horário. Escolha outro período.");
      return;
    }

    const { error: insertError } = await supabase.from("bookings").insert({
      name,
      purpose,
      purpose_other: purpose === "outro" ? purposeOther : null,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
    });

    if (insertError) throw insertError;

    showMessage("Agendamento confirmado!", "success");
    form.reset();
    dateInput.value = bookingDate;
    purposeOtherField.hidden = true;
    loadBookings();
  } catch (err) {
    console.error(err);
    showMessage("Não foi possível agendar agora. Tente novamente em alguns instantes.");
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Confirmar agendamento";
  }
});

// ---------- Load & render bookings ----------

async function loadBookings() {
  bookingsStatus.hidden = false;
  bookingsStatus.textContent = "Carregando agendamentos…";
  bookingsList.innerHTML = "";

  try {
    const from = todayISO();
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .gte("booking_date", from)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      bookingsStatus.hidden = true;
      bookingsList.innerHTML = `<p class="empty-state">Nenhum horário agendado ainda. Seja a primeira pessoa a reservar.</p>`;
      return;
    }

    bookingsStatus.hidden = true;

    const groups = new Map();
    for (const booking of data) {
      if (!groups.has(booking.booking_date)) groups.set(booking.booking_date, []);
      groups.get(booking.booking_date).push(booking);
    }

    const fragment = document.createDocumentFragment();
    for (const [date, bookings] of groups) {
      const label = document.createElement("p");
      label.className = "date-group__label";
      label.textContent = formatDateLabel(date);
      fragment.appendChild(label);

      for (const booking of bookings) {
        fragment.appendChild(renderBookingCard(booking));
      }
    }

    bookingsList.appendChild(fragment);
  } catch (err) {
    console.error(err);
    bookingsStatus.hidden = false;
    bookingsStatus.textContent = "Não foi possível carregar os agendamentos.";
  }
}

function renderBookingCard(booking) {
  const card = document.createElement("div");
  card.className = "booking-card";

  card.innerHTML = `
    <div class="booking-card__stamp">
      <span class="booking-card__stamp-time">${formatTime(booking.start_time)}<br>–<br>${formatTime(booking.end_time)}</span>
    </div>
    <div class="booking-card__body">
      <p class="booking-card__name">${escapeHtml(booking.name)}</p>
      <p class="booking-card__purpose">${escapeHtml(purposeLabel(booking))}</p>
    </div>
    <div class="booking-card__actions">
      <button class="cancel-button" type="button">Cancelar</button>
    </div>
  `;

  card.querySelector(".cancel-button").addEventListener("click", () => cancelBooking(booking.id));

  return card;
}

async function cancelBooking(id) {
  const confirmed = window.confirm("Cancelar este agendamento?");
  if (!confirmed) return;

  try {
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) throw error;
    loadBookings();
  } catch (err) {
    console.error(err);
    window.alert("Não foi possível cancelar. Tente novamente.");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

refreshButton.addEventListener("click", loadBookings);

loadBookings();
