// Ejemplo de uso del organigrama

document.addEventListener('DOMContentLoaded', function() {
  // Datos de ejemplo
  const orgData = {
    tree: [
      {
        id: 1,
        name: "John Doe",
        title: "CEO",
        img: "https://randomuser.me/api/portraits/men/1.jpg"
      },
      {
        id: 2,
        pid: 1,
        name: "Sarah Johnson",
        title: "CTO",
        img: "https://randomuser.me/api/portraits/women/2.jpg"
      },
      {
        id: 3,
        pid: 1,
        name: "Michael Brown",
        title: "CFO",
        img: "https://randomuser.me/api/portraits/men/3.jpg"
      },
      {
        id: 4,
        pid: 2,
        name: "Emily Davis",
        title: "Lead Developer",
        img: "https://randomuser.me/api/portraits/women/4.jpg"
      },
      {
        id: 5,
        pid: 2,
        name: "David Wilson",
        title: "Senior Developer",
        img: "https://randomuser.me/api/portraits/men/5.jpg"
      },
      {
        id: 6,
        pid: 3,
        name: "Lisa Miller",
        title: "Financial Analyst",
        img: "https://randomuser.me/api/portraits/women/6.jpg"
      },
      {
        id: 7,
        pid: 4,
        name: "Robert Taylor",
        title: "Junior Developer",
        img: "https://randomuser.me/api/portraits/men/7.jpg"
      }
    ]
  };

  // Crear el organigrama
  const chart = new HTMLOrgChart({
    container: "organigrama",
    data: orgData,
    options: {
      initialVisibleLevels: 2,
      nodeColor: "#4ade80",
      lineColor: "#4ade80",
      showSortControls: true
    }
  });
});
