import { useState, useEffect } from "react";
import {
    getDoctors,
    addDoctor,
    getAppointments,
    getSchedule,
} from "../services/adminService";

/**
 * Admin dashboard (Doctors / Schedule / Appointments)
 */
export default function AdminDashboard() {
    const [tab, setTab] = useState("doctors");
    const [loading, setLoading] = useState(false);

    // doctors state
    const [doctors, setDoctors] = useState([]);
    const [userIdField, setUserIdField] = useState("");
    const [specField, setSpecField] = useState("");
    const [adding, setAdding] = useState(false);

    // schedule & appointments (placeholder)
    const [schedule, setSchedule] = useState([]);
    const [appointments, setAppointments] = useState([]);

    // load data on tab change
    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                if (tab === "doctors") {
                    const docs = await getDoctors();
                    // добавлена проверка: гарантируем, что doctors всегда массив
                    setDoctors(Array.isArray(docs) ? docs : []);
                } else if (tab === "schedule") {
                    setSchedule(await getSchedule());
                } else if (tab === "appointments") {
                    setAppointments(await getAppointments());
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [tab]);

    // add doctor handler
    async function handleAdd(e) {
        e.preventDefault();
        if (!userIdField || !specField) return;
        setAdding(true);
        try {
            const newDoc = await addDoctor({
                userId: Number(userIdField),
                specialization: specField,
            });
            setDoctors((prev) => [...prev, newDoc]);
            setUserIdField("");
            setSpecField("");
        } catch (e) {
            alert(e.message);
        } finally {
            setAdding(false);
        }
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-10 text-gray-200">
            <h1 className="text-3xl font-semibold mb-8 text-purple-400">
                Админ‑панель клиники
            </h1>

            {/* Tabs */}
            <nav className="flex gap-4 border-b border-gray-700 mb-6">
                {[
                    { id: "doctors", label: "Врачи" },
                    { id: "schedule", label: "Расписание" },
                    { id: "appointments", label: "Записи" },
                ].map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`py-2 px-4 transition-colors ${
                            tab === t.id
                                ? "border-b-2 border-purple-500 text-purple-300"
                                : "text-gray-400 hover:text-gray-200"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>

            {/* Content area */}
            <section className="bg-gray-800/40 rounded-2xl shadow-lg p-6 min-h-[320px]">
                {loading ? (
                    <p className="text-center py-20">Загрузка…</p>) : (
                    <>
                        {tab === "doctors" && (
                            <>
                                {/* add doctor form */}
                                <form onSubmit={handleAdd} className="flex flex-wrap gap-4 mb-6 items-end">
                                    <div>
                                        <label className="block text-sm mb-1" htmlFor="uid">ID пользователя</label>
                                        <input id="uid" type="number" value={userIdField} onChange={(e)=>setUserIdField(e.target.value)}
                                               className="bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500" required/>
                                    </div>
                                    <div>
                                        <label className="block text-sm mb-1" htmlFor="spec">Специализация</label>
                                        <input id="spec" value={specField} onChange={(e)=>setSpecField(e.target.value)}
                                               className="bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500" required/>
                                    </div>
                                    <button type="submit" disabled={adding}
                                            className="h-10 px-6 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors">
                                        {adding ? "Добавление…" : "Добавить"}
                                    </button>
                                </form>

                                <DataTable columns={["ID","ФИО","Специализация"]}
                                           rows={doctors.map(d=>[d.id,d.full_name,d.specialization])} />
                            </>
                        )}

                        {tab === "schedule" && (
                            <p className="text-center py-12 text-gray-400">Блок расписания в разработке</p>
                        )}

                        {tab === "appointments" && (
                            <DataTable columns={["ID","Пациент","Врач","Дата","Статус"]}
                                       rows={appointments.map(a=>[a.id,a.patient_name,a.doctor_name,new Date(a.date).toLocaleString(),a.status])} />
                        )}
                    </>
                )}
            </section>
        </div>
    );
}

function DataTable({ columns, rows }) {
    return rows.length === 0 ? (
        <p className="text-center py-12 text-gray-400">Нет данных</p>) : (
        <table className="w-full text-left border-collapse">
            <thead className="bg-gray-700 text-sm uppercase text-gray-300">
            <tr>{columns.map(c=>(<th key={c} className="py-3 px-4 font-medium">{c}</th>))}</tr>
            </thead>
            <tbody>
            {rows.map((row,idx)=>(
                <tr key={idx} className={idx%2?"bg-gray-800/60":"bg-gray-800/30"}>
                    {row.map((cell,i)=>(<td key={i} className="py-2 px-4 whitespace-nowrap">{cell}</td>))}
                </tr>))}
            </tbody>
        </table>
    );
}
