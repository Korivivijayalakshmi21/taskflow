import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "./supabase";
import "./App.css";

function App() {
  const [session, setSession] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activePage, setActivePage] = useState("Dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [dueDate, setDueDate] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [loadingTasks, setLoadingTasks] = useState(false);

  /*
    Stores the date on which each task was marked Done.

    This is kept in localStorage so we do NOT need to change
    your existing Supabase table.
  */
  const [completionDates, setCompletionDates] = useState(() => {
    try {
      const saved = localStorage.getItem(
        "taskflow_completion_dates"
      );

      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        "taskflow_completion_dates",
        JSON.stringify(completionDates)
      );
    } catch {
      // Ignore localStorage errors.
    }
  }, [completionDates]);

  useEffect(() => {
    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadTasks();
    }
  }, [session]);

  async function checkSession() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  }

  async function login() {
    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }

    setAuthLoading(true);

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    setAuthLoading(false);

    if (error) {
      alert(error.message);
    }
  }

  async function signup() {
    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }

    if (password.length < 6) {
      alert("Password must contain at least 6 characters.");
      return;
    }

    setAuthLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setAuthLoading(false);

    if (error) {
      alert(error.message);
    } else {
      alert("Account created successfully!");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function loadTasks() {
    setLoadingTasks(true);

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    setLoadingTasks(false);

    if (error) {
      alert(error.message);
      return;
    }

    const loadedTasks = data || [];

    setTasks(loadedTasks);

    /*
      IMPORTANT GRAPH FIX

      Older tasks that were already marked Done before
      the completion-date feature was added do not have
      a completion date in localStorage.

      We treat those existing Done tasks as completed today.
      This allows your current completed tasks to immediately
      appear in today's graph without changing Supabase.
    */
    const todayKey = new Date()
      .toISOString()
      .split("T")[0];

    setCompletionDates((previous) => {
      const updated = { ...previous };
      let changed = false;

      loadedTasks.forEach((task) => {
        if (
          task.status === "Done" &&
          !updated[task.id]
        ) {
          updated[task.id] = todayKey;
          changed = true;
        }
      });

      return changed ? updated : previous;
    });
  }

  async function addTask(event) {
    event.preventDefault();

    if (!title.trim()) {
      alert("Please enter a task name.");
      return;
    }

    const { error } = await supabase.from("tasks").insert({
      user_id: session.user.id,
      title: title.trim(),
      assignee: assignee.trim(),
      priority,
      due_date: dueDate || null,
      status: "To Do",
    });

    if (error) {
      alert(error.message);
      return;
    }

    setTitle("");
    setAssignee("");
    setPriority("Medium");
    setDueDate("");

    await loadTasks();
  }

  async function updateStatus(id, status) {
    const { error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    /*
      Record the actual day when the task was marked Done.
      This powers the daily progress charts.
    */
    setCompletionDates((previous) => {
      const updated = { ...previous };

      if (status === "Done") {
        updated[id] = new Date()
          .toISOString()
          .split("T")[0];
      } else {
        delete updated[id];
      }

      return updated;
    });

    await loadTasks();
  }

  async function updateDueDate(id, date) {
    const { error } = await supabase
      .from("tasks")
      .update({
        due_date: date || null,
      })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadTasks();
  }

  async function updatePriority(id, value) {
    const { error } = await supabase
      .from("tasks")
      .update({
        priority: value,
      })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadTasks();
  }

  async function deleteTask(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this task?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setCompletionDates((previous) => {
      const updated = { ...previous };
      delete updated[id];
      return updated;
    });

    await loadTasks();
  }

  const stats = useMemo(() => {
    const today = new Date()
      .toISOString()
      .split("T")[0];

    const completed = tasks.filter(
      (task) => task.status === "Done"
    ).length;

    const active = tasks.filter(
      (task) => task.status === "In Progress"
    ).length;

    const todo = tasks.filter(
      (task) => task.status === "To Do"
    ).length;

    const overdue = tasks.filter(
      (task) =>
        task.due_date &&
        task.due_date < today &&
        task.status !== "Done"
    ).length;

    const dueToday = tasks.filter(
      (task) =>
        task.due_date === today &&
        task.status !== "Done"
    ).length;

    const completion = tasks.length
      ? Math.round((completed / tasks.length) * 100)
      : 0;

    return {
      completed,
      active,
      todo,
      overdue,
      dueToday,
      completion,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const query = search.toLowerCase();

      const matchesSearch =
        task.title.toLowerCase().includes(query) ||
        (task.assignee || "")
          .toLowerCase()
          .includes(query);

      const matchesFilter =
        filter === "All" || task.status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [tasks, search, filter]);

  const userName =
    session?.user?.email?.split("@")[0] || "User";

  const today = new Date()
    .toISOString()
    .split("T")[0];

  const upcomingTasks = [...tasks]
    .filter((task) => task.due_date)
    .sort((a, b) =>
      String(a.due_date).localeCompare(
        String(b.due_date)
      )
    );

  const teamMembers = useMemo(() => {
    const members = {};

    tasks.forEach((task) => {
      const name =
        task.assignee?.trim() || "Unassigned";

      if (!members[name]) {
        members[name] = {
          name,
          total: 0,
          completed: 0,
          active: 0,
        };
      }

      members[name].total += 1;

      if (task.status === "Done") {
        members[name].completed += 1;
      }

      if (task.status === "In Progress") {
        members[name].active += 1;
      }
    });

    return Object.values(members);
  }, [tasks]);

  /*
    ============================================
    DAILY PROGRESS DATA
    ============================================
  */

  const progressData = useMemo(() => {
    const days = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();

      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);

      const dateKey = date
        .toISOString()
        .split("T")[0];

      const completed = tasks.filter(
        (task) =>
          task.status === "Done" &&
          completionDates[task.id] === dateKey
      ).length;

      days.push({
        dateKey,
        day: date.toLocaleDateString("en-US", {
          weekday: "short",
        }),
        completed,
      });
    }

    let runningTotal = 0;

    return days.map((day) => {
      runningTotal += day.completed;

      return {
        ...day,
        progress: runningTotal,
      };
    });
  }, [tasks, completionDates]);

  /*
    ============================================
    LOGIN SCREEN
    ============================================
  */

  if (!session) {
    return (
      <main className="auth-screen">
        <div className="auth-background-shape shape-a" />
        <div className="auth-background-shape shape-b" />
        <div className="auth-background-shape shape-c" />

        <section className="auth-layout">
          <div className="auth-brand-panel">
            <div className="brand-lockup">
              <div className="logo-mark">T</div>
              <span>TaskFlow</span>
            </div>

            <div className="auth-hero-copy">
              <div className="eyebrow">
                PROJECT MANAGEMENT, SIMPLIFIED
              </div>

              <h1>
                Turn busy work
                <span> into progress.</span>
              </h1>

              <p>
                Plan projects, manage tasks and keep your
                entire workflow moving from one beautiful
                workspace.
              </p>
            </div>

            <div className="auth-feature-list">
              <div>
                <b>01</b>
                <span>Organize every task</span>
              </div>

              <div>
                <b>02</b>
                <span>Track real progress</span>
              </div>

              <div>
                <b>03</b>
                <span>Finish work faster</span>
              </div>
            </div>
          </div>

          <div className="auth-form-panel">
            <div className="auth-form-card">
              <div className="mobile-logo">
                <div className="logo-mark">T</div>
                <span>TaskFlow</span>
              </div>

              <div className="form-heading">
                <span>WELCOME BACK</span>

                <h2>
                  Sign in to your workspace
                </h2>

                <p>
                  Manage your projects from one place.
                </p>
              </div>

              <label>Email address</label>

              <input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
              />

              <label>Password</label>

              <div className="password-field">
                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      !showPassword
                    )
                  }
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              <button
                className="auth-primary"
                onClick={login}
                disabled={authLoading}
              >
                {authLoading
                  ? "Signing in..."
                  : "Sign in"}
              </button>

              <button
                className="auth-secondary"
                onClick={signup}
                disabled={authLoading}
              >
                Create new account
              </button>

              <div className="auth-note">
                Your workspace is protected by secure
                authentication.
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  /*
    ============================================
    PAGE RENDERING
    ============================================
  */

  function renderPage() {
    if (activePage === "Projects") {
      return (
        <section className="tasks-section dashboard-card">
          <div className="tasks-toolbar">
            <div>
              <span className="panel-kicker">
                PROJECTS
              </span>

              <h2>Project overview</h2>
            </div>
          </div>

          <div style={{ padding: "28px" }}>
            <div className="insight-grid">
              <article className="dashboard-card progress-panel">
                <span className="panel-kicker">
                  CURRENT PROJECT
                </span>

                <h2>TaskFlow Workspace</h2>

                <p
                  style={{
                    color: "#aab5ca",
                    lineHeight: 1.7,
                  }}
                >
                  Your main workspace for managing
                  tasks, deadlines, priorities and
                  progress.
                </p>

                <div className="progress-track">
                  <div
                    className="progress-value"
                    style={{
                      width: `${stats.completion}%`,
                    }}
                  />
                </div>

                <p style={{ color: "#8490a8" }}>
                  {stats.completion}% completed
                </p>
              </article>

              <article className="dashboard-card progress-panel">
                <span className="panel-kicker">
                  PROJECT STATUS
                </span>

                <h2>
                  {stats.overdue > 0
                    ? "Needs attention"
                    : "On track"}
                </h2>

                <p
                  style={{
                    color: "#aab5ca",
                    lineHeight: 1.7,
                  }}
                >
                  {stats.overdue > 0
                    ? `${stats.overdue} task(s) are overdue.`
                    : "Your project currently has no overdue tasks."}
                </p>
              </article>
            </div>
          </div>
        </section>
      );
    }

    if (activePage === "Tasks") {
      return (
        <>
          <section className="quick-create dashboard-card">
            <div className="quick-create-title">
              <div className="create-symbol">＋</div>

              <div>
                <span className="panel-kicker">
                  QUICK ACTION
                </span>

                <h2>Create a task</h2>
              </div>
            </div>

            <form onSubmit={addTask}>
              <input
                placeholder="What needs to be done?"
                value={title}
                onChange={(e) =>
                  setTitle(e.target.value)
                }
                required
              />

              <input
                placeholder="Assignee"
                value={assignee}
                onChange={(e) =>
                  setAssignee(e.target.value)
                }
              />

              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value)
                }
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>

              <input
                type="date"
                value={dueDate}
                min={today}
                onChange={(e) =>
                  setDueDate(e.target.value)
                }
              />

              <button type="submit">
                Create task
                <span>→</span>
              </button>
            </form>
          </section>

          <TaskTable />
        </>
      );
    }

    if (activePage === "Calendar") {
      return (
        <section className="tasks-section dashboard-card">
          <div className="tasks-toolbar">
            <div>
              <span className="panel-kicker">
                CALENDAR
              </span>

              <h2>Task deadlines</h2>
            </div>
          </div>

          <div style={{ padding: "20px" }}>
            {upcomingTasks.length === 0 ? (
              <div className="empty-workspace">
                <div className="empty-icon">◌</div>

                <h3>No deadlines yet</h3>

                <p>
                  Create a task and choose a due date
                  to see it here.
                </p>
              </div>
            ) : (
              <div className="task-table">
                {upcomingTasks.map((task) => (
                  <div
                    className="task-line"
                    key={task.id}
                  >
                    <div className="task-name">
                      <div
                        className={`task-status-light ${
                          task.status === "Done"
                            ? "done-light"
                            : task.status ===
                              "In Progress"
                            ? "active-light"
                            : "todo-light"
                        }`}
                      />

                      <div>
                        <strong>{task.title}</strong>

                        <span>{task.status}</span>
                      </div>
                    </div>

                    <div className="task-person">
                      <div className="mini-avatar">
                        {(task.assignee || "U")
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <span>
                        {task.assignee ||
                          "Unassigned"}
                      </span>
                    </div>

                    <span
                      className={`priority-badge ${task.priority.toLowerCase()}`}
                    >
                      {task.priority}
                    </span>

                    <input
                      type="date"
                      value={task.due_date || ""}
                      onChange={(e) =>
                        updateDueDate(
                          task.id,
                          e.target.value
                        )
                      }
                      style={{
                        background: "#0d162a",
                        color: "#dce4f4",
                        border:
                          "1px solid rgba(255,255,255,.1)",
                        borderRadius: "7px",
                        padding: "6px",
                      }}
                    />

                    <select
                      value={task.status}
                      onChange={(e) =>
                        updateStatus(
                          task.id,
                          e.target.value
                        )
                      }
                      className={`status-badge ${task.status
                        .toLowerCase()
                        .replace(" ", "-")}`}
                    >
                      <option>To Do</option>
                      <option>In Progress</option>
                      <option>Done</option>
                    </select>

                    <button
                      className="remove-task"
                      onClick={() =>
                        deleteTask(task.id)
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      );
    }

    /*
      ============================================
      ANALYTICS PAGE WITH BOTH GRAPHS
      ============================================
    */

    if (activePage === "Analytics") {
      return (
        <>
          <section className="stats-row">
            <article className="metric-card blue">
              <div className="metric-top">
                <span>Total tasks</span>
                <div className="metric-icon">▦</div>
              </div>

              <strong>{tasks.length}</strong>

              <div className="metric-bottom">
                <span>All workspace tasks</span>
              </div>
            </article>

            <article className="metric-card violet">
              <div className="metric-top">
                <span>In progress</span>
                <div className="metric-icon">◒</div>
              </div>

              <strong>{stats.active}</strong>

              <div className="metric-bottom">
                <span>Currently active</span>
              </div>
            </article>

            <article className="metric-card green">
              <div className="metric-top">
                <span>Completed</span>
                <div className="metric-icon">✓</div>
              </div>

              <strong>{stats.completed}</strong>

              <div className="metric-bottom">
                <span>
                  {stats.completion}% completion
                </span>
              </div>
            </article>

            <article className="metric-card orange">
              <div className="metric-top">
                <span>Overdue</span>
                <div className="metric-icon">!</div>
              </div>

              <strong>{stats.overdue}</strong>

              <div className="metric-bottom">
                <span>Needs attention</span>
              </div>
            </article>
          </section>

          <section className="insight-grid">
            <article className="dashboard-card progress-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">
                    COMPLETION
                  </span>

                  <h2>Overall progress</h2>
                </div>
              </div>

              <div className="progress-main">
                <div className="big-progress-number">
                  {stats.completion}
                  <small>%</small>
                </div>

                <div>
                  <p>
                    {stats.completed} of {tasks.length}{" "}
                    tasks completed.
                  </p>

                  <span>
                    Keep moving your work forward.
                  </span>
                </div>
              </div>

              <div className="progress-track">
                <div
                  className="progress-value"
                  style={{
                    width: `${stats.completion}%`,
                  }}
                />
              </div>
            </article>

            <article className="dashboard-card progress-panel">
              <span className="panel-kicker">
                DEADLINES
              </span>

              <h2>Deadline health</h2>

              <p
                style={{
                  color: "#aab5ca",
                  lineHeight: 1.7,
                  marginTop: "20px",
                }}
              >
                {stats.dueToday > 0
                  ? `${stats.dueToday} task(s) are due today.`
                  : "Nothing is due today."}
              </p>

              <p
                style={{
                  color:
                    stats.overdue > 0
                      ? "#ff8994"
                      : "#59e0a5",
                }}
              >
                {stats.overdue > 0
                  ? `${stats.overdue} overdue task(s).`
                  : "No overdue tasks."}
              </p>
            </article>
          </section>

          {/* ======================================
              DAILY PROGRESS CHARTS
          ======================================= */}

          <section
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(340px, 1fr))",
              gap: "20px",
              marginTop: "24px",
            }}
          >
            {/* BAR GRAPH */}
            <article
              className="dashboard-card"
              style={{
                padding: "24px",
                minHeight: "370px",
              }}
            >
              <div
                style={{
                  marginBottom: "20px",
                }}
              >
                <span className="panel-kicker">
                  DAILY ACTIVITY
                </span>

                <h2
                  style={{
                    marginTop: "6px",
                    marginBottom: "6px",
                  }}
                >
                  Tasks completed each day
                </h2>

                <p
                  style={{
                    color: "#8995ae",
                    margin: 0,
                    fontSize: "13px",
                  }}
                >
                  Completed tasks over the last 7 days.
                </p>
              </div>

              <div
                style={{
                  width: "100%",
                  height: "270px",
                }}
              >
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={progressData}
                    margin={{
                      top: 10,
                      right: 10,
                      left: -20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.07)"
                    />

                    <XAxis
                      dataKey="day"
                      stroke="#8995ae"
                      tick={{
                        fill: "#8995ae",
                        fontSize: 12,
                      }}
                    />

                    <YAxis
                      allowDecimals={false}
                      stroke="#8995ae"
                      tick={{
                        fill: "#8995ae",
                        fontSize: 12,
                      }}
                    />

                    <Tooltip
                      contentStyle={{
                        background: "#10172a",
                        border:
                          "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        color: "#f5f7ff",
                      }}
                      labelStyle={{
                        color: "#f5f7ff",
                      }}
                      itemStyle={{
                        color: "#69a4ff",
                      }}
                    />

                    <Bar
                      dataKey="completed"
                      name="Completed"
                      fill="#3b82f6"
                      radius={[7, 7, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            {/* LINE GRAPH */}
            <article
              className="dashboard-card"
              style={{
                padding: "24px",
                minHeight: "370px",
              }}
            >
              <div
                style={{
                  marginBottom: "20px",
                }}
              >
                <span className="panel-kicker">
                  PROGRESS TREND
                </span>

                <h2
                  style={{
                    marginTop: "6px",
                    marginBottom: "6px",
                  }}
                >
                  Progress over time
                </h2>

                <p
                  style={{
                    color: "#8995ae",
                    margin: 0,
                    fontSize: "13px",
                  }}
                >
                  Cumulative completed tasks over the
                  last 7 days.
                </p>
              </div>

              <div
                style={{
                  width: "100%",
                  height: "270px",
                }}
              >
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <LineChart
                    data={progressData}
                    margin={{
                      top: 10,
                      right: 10,
                      left: -20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.07)"
                    />

                    <XAxis
                      dataKey="day"
                      stroke="#8995ae"
                      tick={{
                        fill: "#8995ae",
                        fontSize: 12,
                      }}
                    />

                    <YAxis
                      allowDecimals={false}
                      stroke="#8995ae"
                      tick={{
                        fill: "#8995ae",
                        fontSize: 12,
                      }}
                    />

                    <Tooltip
                      contentStyle={{
                        background: "#10172a",
                        border:
                          "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        color: "#f5f7ff",
                      }}
                      labelStyle={{
                        color: "#f5f7ff",
                      }}
                      itemStyle={{
                        color: "#a78bfa",
                      }}
                    />

                    <Line
                      type="monotone"
                      dataKey="progress"
                      name="Total completed"
                      stroke="#8b5cf6"
                      strokeWidth={4}
                      dot={{
                        r: 5,
                        fill: "#8b5cf6",
                        strokeWidth: 0,
                      }}
                      activeDot={{
                        r: 7,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>
        </>
      );
    }

    if (activePage === "Team") {
      return (
        <section className="tasks-section dashboard-card">
          <div className="tasks-toolbar">
            <div>
              <span className="panel-kicker">
                TEAM
              </span>

              <h2>Team workload</h2>
            </div>
          </div>

          <div style={{ padding: "20px" }}>
            {teamMembers.length === 0 ? (
              <div className="empty-workspace">
                <div className="empty-icon">♧</div>

                <h3>No team members yet</h3>

                <p>
                  Add an assignee when creating a task.
                </p>
              </div>
            ) : (
              teamMembers.map((member) => (
                <div
                  key={member.name}
                  className="task-line"
                  style={{
                    gridTemplateColumns:
                      "1fr 120px 120px 120px",
                  }}
                >
                  <div className="task-person">
                    <div className="mini-avatar">
                      {member.name
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <span
                      style={{
                        color: "#dce4f4",
                        fontSize: "12px",
                      }}
                    >
                      {member.name}
                    </span>
                  </div>

                  <span className="task-due">
                    {member.total} tasks
                  </span>

                  <span className="priority-badge medium">
                    {member.active} active
                  </span>

                  <span className="priority-badge low">
                    {member.completed} done
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      );
    }

    return <Dashboard />;
  }

  /*
    ============================================
    DASHBOARD
    ============================================
  */

  function Dashboard() {
    return (
      <>
        <section className="stats-row">
          <article className="metric-card blue">
            <div className="metric-top">
              <span>Total tasks</span>
              <div className="metric-icon">▦</div>
            </div>

            <strong>{tasks.length}</strong>

            <div className="metric-bottom">
              <span className="trend">
                Workspace
              </span>

              <span>All tasks</span>
            </div>
          </article>

          <article className="metric-card violet">
            <div className="metric-top">
              <span>In progress</span>
              <div className="metric-icon">◒</div>
            </div>

            <strong>{stats.active}</strong>

            <div className="metric-bottom">
              <span className="trend violet-text">
                {stats.dueToday} due today
              </span>

              <span>Active</span>
            </div>
          </article>

          <article className="metric-card green">
            <div className="metric-top">
              <span>Completed</span>
              <div className="metric-icon">✓</div>
            </div>

            <strong>{stats.completed}</strong>

            <div className="metric-bottom">
              <span className="trend green-text">
                {stats.completion}% complete
              </span>

              <span>Finished</span>
            </div>
          </article>

          <article className="metric-card orange">
            <div className="metric-top">
              <span>Attention</span>
              <div className="metric-icon">!</div>
            </div>

            <strong>{stats.overdue}</strong>

            <div className="metric-bottom">
              <span className="trend orange-text">
                Needs attention
              </span>

              <span>Overdue</span>
            </div>
          </article>
        </section>

        <section className="insight-grid">
          <article className="dashboard-card progress-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">
                  PROJECT HEALTH
                </span>

                <h2>Overall progress</h2>
              </div>

              <span className="health-pill">
                ●{" "}
                {stats.overdue > 0
                  ? "Needs attention"
                  : "On track"}
              </span>
            </div>

            <div className="progress-main">
              <div className="big-progress-number">
                {stats.completion}
                <small>%</small>
              </div>

              <div>
                <p>
                  {stats.completed} of {tasks.length}{" "}
                  tasks completed.
                </p>

                <span>
                  {stats.completion >= 70
                    ? "Your workspace is moving at a strong pace."
                    : "Your workspace is building momentum."}
                </span>
              </div>
            </div>

            <div className="progress-track">
              <div
                className="progress-value"
                style={{
                  width: `${stats.completion}%`,
                }}
              />
            </div>

            <div className="progress-labels">
              <span>Start</span>
              <span>Target: 100%</span>
            </div>
          </article>

          <article className="dashboard-card distribution-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">
                  TASK BREAKDOWN
                </span>

                <h2>Where work stands</h2>
              </div>
            </div>

            <div className="distribution-body">
              <div
                className="donut-chart"
                style={{
                  background: `conic-gradient(
                    #23d18b 0% ${
                      tasks.length
                        ? (stats.completed /
                            tasks.length) *
                          100
                        : 0
                    }%,
                    #8b5cf6 ${
                      tasks.length
                        ? (stats.completed /
                            tasks.length) *
                          100
                        : 0
                    }% ${
                      tasks.length
                        ? ((stats.completed +
                            stats.active) /
                            tasks.length) *
                          100
                        : 0
                    }%,
                    #2f80ed ${
                      tasks.length
                        ? ((stats.completed +
                            stats.active) /
                            tasks.length) *
                          100
                        : 0
                    }% 100%
                  )`,
                }}
              >
                <div>
                  <strong>{tasks.length}</strong>
                  <span>tasks</span>
                </div>
              </div>

              <div className="distribution-list">
                <div>
                  <span className="dot green-dot"></span>
                  <p>Completed</p>
                  <strong>{stats.completed}</strong>
                </div>

                <div>
                  <span className="dot purple-dot"></span>
                  <p>In progress</p>
                  <strong>{stats.active}</strong>
                </div>

                <div>
                  <span className="dot blue-dot"></span>
                  <p>To do</p>
                  <strong>{stats.todo}</strong>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="quick-create dashboard-card">
          <div className="quick-create-title">
            <div className="create-symbol">＋</div>

            <div>
              <span className="panel-kicker">
                QUICK ACTION
              </span>

              <h2>Create a task</h2>
            </div>
          </div>

          <form onSubmit={addTask}>
            <input
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
              required
            />

            <input
              placeholder="Assignee"
              value={assignee}
              onChange={(e) =>
                setAssignee(e.target.value)
              }
            />

            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value)
              }
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>

            <input
              type="date"
              value={dueDate}
              min={today}
              onChange={(e) =>
                setDueDate(e.target.value)
              }
            />

            <button type="submit">
              Create task
              <span>→</span>
            </button>
          </form>
        </section>

        <TaskTable />
      </>
    );
  }

  /*
    ============================================
    TASK TABLE
    ============================================
  */

  function TaskTable() {
    return (
      <section className="tasks-section dashboard-card">
        <div className="tasks-toolbar">
          <div>
            <span className="panel-kicker">
              WORKSPACE
            </span>

            <h2>Your tasks</h2>
          </div>

          <div className="task-tools">
            <div className="filter-tabs">
              {[
                "All",
                "To Do",
                "In Progress",
                "Done",
              ].map((item) => (
                <button
                  key={item}
                  className={
                    filter === item
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    setFilter(item)
                  }
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="task-table">
          <div className="task-header">
            <span>Task</span>
            <span>Assignee</span>
            <span>Priority</span>
            <span>Due</span>
            <span>Status</span>
            <span></span>
          </div>

          {loadingTasks ? (
            <div className="table-message">
              Loading your workspace...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="empty-workspace">
              <div className="empty-icon">✦</div>

              <h3>
                {tasks.length === 0
                  ? "Your workspace is ready."
                  : "No matching tasks."}
              </h3>

              <p>
                {tasks.length === 0
                  ? "Create your first task above and start making progress."
                  : "Try another search or filter."}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div
                className="task-line"
                key={task.id}
              >
                <div className="task-name">
                  <div
                    className={`task-status-light ${
                      task.status === "Done"
                        ? "done-light"
                        : task.status ===
                          "In Progress"
                        ? "active-light"
                        : "todo-light"
                    }`}
                  />

                  <div>
                    <strong>{task.title}</strong>

                    <span>
                      {task.status === "Done"
                        ? "Completed"
                        : task.status ===
                          "In Progress"
                        ? "Currently working"
                        : "Waiting to start"}
                    </span>
                  </div>
                </div>

                <div className="task-person">
                  <div className="mini-avatar">
                    {(task.assignee || "U")
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <span>
                    {task.assignee ||
                      "Unassigned"}
                  </span>
                </div>

                <select
                  value={task.priority}
                  onChange={(e) =>
                    updatePriority(
                      task.id,
                      e.target.value
                    )
                  }
                  className={`priority-badge ${task.priority.toLowerCase()}`}
                  style={{
                    border: "0",
                    outline: "none",
                  }}
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>

                <input
                  type="date"
                  value={task.due_date || ""}
                  onChange={(e) =>
                    updateDueDate(
                      task.id,
                      e.target.value
                    )
                  }
                  style={{
                    width: "100%",
                    background: "#0d162a",
                    color: "#dce4f4",
                    border:
                      "1px solid rgba(255,255,255,.1)",
                    borderRadius: "7px",
                    padding: "6px",
                    fontSize: "10px",
                  }}
                />

                <select
                  value={task.status}
                  onChange={(e) =>
                    updateStatus(
                      task.id,
                      e.target.value
                    )
                  }
                  className={`status-badge ${task.status
                    .toLowerCase()
                    .replace(" ", "-")}`}
                >
                  <option>To Do</option>
                  <option>In Progress</option>
                  <option>Done</option>
                </select>

                <button
                  className="remove-task"
                  onClick={() =>
                    deleteTask(task.id)
                  }
                  title="Delete task"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  /*
    ============================================
    MAIN APPLICATION
    ============================================
  */

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-mark">T</div>

          <div>
            <strong>TaskFlow</strong>
            <span>Workspace</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">
            WORKSPACE
          </div>

          {[
            ["Dashboard", "▦"],
            ["Projects", "◫"],
            ["Tasks", "✓"],
            ["Calendar", "◌"],
          ].map(([name, icon]) => (
            <button
              key={name}
              className={`nav-item ${
                activePage === name
                  ? "active"
                  : ""
              }`}
              onClick={() => {
                setActivePage(name);

                if (name !== "Dashboard") {
                  setSearch("");
                  setFilter("All");
                }
              }}
            >
              <span>{icon}</span>
              {name}
            </button>
          ))}

          <div className="nav-label second">
            INSIGHTS
          </div>

          {[
            ["Analytics", "↗"],
            ["Team", "♧"],
          ].map(([name, icon]) => (
            <button
              key={name}
              className={`nav-item ${
                activePage === name
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActivePage(name)
              }
            >
              <span>{icon}</span>
              {name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">✦</div>

            <strong>Build momentum</strong>

            <p>
              Keep your team aligned and your projects
              moving.
            </p>

            <div className="upgrade-line">
              <span></span>
            </div>
          </div>

          <button
            className="sidebar-logout"
            onClick={logout}
          >
            ↪ &nbsp; Sign out
          </button>
        </div>
      </aside>

      <section className="main-area">
        <header className="top-header">
          <div className="mobile-title">
            <div className="logo-mark">T</div>
            <strong>TaskFlow</strong>
          </div>

          <div className="global-search">
            <span>⌕</span>

            <input
              placeholder="Search tasks or people..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

            <kbd>⌘ K</kbd>
          </div>

          <div className="header-actions">
            <button className="icon-button">
              ◐
              <i></i>
            </button>

            <div className="header-divider"></div>

            <div className="user-profile">
              <div className="user-avatar">
                {userName
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div>
                <strong>{userName}</strong>
                <span>Member</span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="breadcrumb">
                WORKSPACE /{" "}
                <span>
                  {activePage.toUpperCase()}
                </span>
              </div>

              <h1>
                {activePage === "Dashboard"
                  ? `Good morning, ${userName}.`
                  : activePage}
              </h1>

              <p>
                {activePage === "Dashboard"
                  ? "Here's what's happening across your workspace."
                  : activePage === "Calendar"
                  ? "Manage deadlines and keep your work on schedule."
                  : activePage === "Tasks"
                  ? "Create, update and manage every task."
                  : activePage === "Projects"
                  ? "See your project health and progress."
                  : activePage === "Analytics"
                  ? "Understand your team's work and progress."
                  : "See workload and task ownership across your team."}
              </p>
            </div>

            <div className="heading-date">
              <span>TODAY</span>

              <strong>
                {new Date().toLocaleDateString(
                  "en-US",
                  {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  }
                )}
              </strong>
            </div>
          </section>

          {renderPage()}

          <footer className="app-footer">
            <span>TaskFlow © 2026</span>

            <span>
              Focused work. Better results.
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}

export default App;