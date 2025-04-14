/**
 * HTMLOrgChart.js - Biblioteca ligera para generar organigramas con HTML y CSS
 * Implementación con estructura UL/LI para mejor jerarquía y conexiones
 */
class HTMLOrgChart {
  constructor(config) {
    // Validar configuración básica
    if (!config.container) {
      throw new Error('Debe especificarse un contenedor');
    }
    if (!config.data) {
      throw new Error('Se requieren datos para generar el organigrama');
    }

    // Obtener elemento contenedor
    this.container = document.getElementById(config.container);
    if (!this.container) {
      throw new Error(`Contenedor con ID '${config.container}' no encontrado`);
    }

    // Configuración predeterminada
    const defaultOptions = {
      nodeWidth: 180,
      nodeHeight: 140,
      horizontalSpacing: 40,
      verticalSpacing: 60,
      avatarSize: 60,
      nodeColor: "#4ade80",
      lineColor: "#4ade80",
      textColor: "#000000",
      subtitleColor: "#6b7280",
      initiallyExpanded: false,
      initialVisibleLevels: 1,
      sortBy: 'name',
      sortDirection: 'asc',
      sortFunction: null,
      showSortControls: false,
      initialZoom: 1
    };

    // Combinar opciones predeterminadas con las proporcionadas
    this.options = { ...defaultOptions, ...(config.options || {}) };

    // Datos del organigrama
    this.data = config.data;

    // Datos procesados en formato jerárquico
    this.hierarchicalData = null;

    // Mapa para almacenar el estado de expansión de los nodos
    this.expandedNodes = new Map();

    // Inicializar
    this.initialize();
  }

  /**
   * Inicializa el organigrama
   */
  initialize() {
    // Procesar datos
    this.processData();

    // Renderizar
    this.render();

    // Configurar controles de zoom y arrastre
    this.setupZoomControls();
  }

  /**
   * Procesa los datos para convertirlos en estructura jerárquica
   */
  processData() {
    const data = this.data.tree || this.data;

    // Eliminar duplicados de los datos de entrada basándose solo en ID
    const uniqueData = [];
    const seenIds = new Set();

    for (const node of data) {
      if (!seenIds.has(node.id)) {
        seenIds.add(node.id);
        uniqueData.push(node);
      }
    }

    // Crear un mapa para buscar nodos por ID
    const nodeMap = new Map();

    // Primera pasada: agregar todos los nodos al mapa
    uniqueData.forEach(node => {
      // Crear una copia del nodo con un array de hijos vacío
      const processedNode = { ...node, children: [], level: 0 };

      // Añadir el nodo al mapa
      nodeMap.set(node.id, processedNode);
    });

    // Segunda pasada: construir la jerarquía y determinar niveles
    const rootNodes = [];

    uniqueData.forEach(node => {
      const processedNode = nodeMap.get(node.id);

      // Si el nodo tiene un padre, añadirlo como hijo de ese padre
      if (node.pid && nodeMap.has(node.pid)) {
        const parentNode = nodeMap.get(node.pid);
        processedNode.level = parentNode.level + 1;
        parentNode.children.push(processedNode);
      } else {
        // Si no tiene padre, es un nodo raíz (nivel 0)
        processedNode.level = 0;
        rootNodes.push(processedNode);
      }
    });

    // Ordenar nodos según configuración
    this.sortNodes(rootNodes);

    // Almacenar datos procesados
    this.hierarchicalData = rootNodes;

    // Configurar expansión inicial
    this.configureInitialExpansion();
  }

  /**
   * Configura el estado de expansión inicial de los nodos según el nivel jerárquico
   */
  configureInitialExpansion() {
    const configureExpansion = (nodes, level) => {
      nodes.forEach(node => {
        const expanded = this.options.initiallyExpanded || level < this.options.initialVisibleLevels;
        this.expandedNodes.set(node.id, expanded);

        if (node.children && node.children.length > 0) {
          configureExpansion(node.children, level + 1);
        }
      });
    };

    // Comenzar desde nodos raíz (nivel 0)
    configureExpansion(this.hierarchicalData, 0);
  }

  /**
   * Ordena los nodos en el árbol según las opciones configuradas
   * @param {Array} nodes - Los nodos a ordenar
   */
  sortNodes(nodes) {
    if (!nodes || !nodes.length) return;

    // Ordenar por el campo especificado
    const sortField = this.options.sortBy;
    const isAscending = this.options.sortDirection === 'asc';

    nodes.sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';

      // Comparaciones de cadenas insensibles a mayúsculas/minúsculas
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return isAscending ? -1 : 1;
      if (valA > valB) return isAscending ? 1 : -1;
      return 0;
    });

    // Ordenar recursivamente los hijos
    for (const node of nodes) {
      if (node.children && node.children.length) {
        this.sortNodes(node.children);
      }
    }
  }

  /**
   * Renderiza el organigrama completo
   */
  render() {
    // Limpiar el contenedor
    this.container.innerHTML = '';

    // Crear contenedor principal del organigrama con capacidad de zoom y arrastre
    const chartContainer = document.createElement('div');
    chartContainer.className = 'org-chart-container';
    this.chartContainer = chartContainer;

    // Crear el árbol jerárquico usando UL/LI para mejor estructura
    const orgChart = document.createElement('div');
    orgChart.className = 'organigrama';

    // Crear la lista de nodos raíz
    const rootList = document.createElement('ul');
    rootList.className = 'nodes';

    // Renderizar nodos recursivamente usando la estructura UL/LI
    this.hierarchicalData.forEach(node => {
      const nodeElement = this.renderNodeUL(node, 1); // Comenzar en nivel 1
      rootList.appendChild(nodeElement);
    });

    // Armar la estructura completa
    orgChart.appendChild(rootList);
    chartContainer.appendChild(orgChart);
    this.container.appendChild(chartContainer);

    // Crear controles de navegación (zoom, expand/collapse, etc.)
    this.createControls();

    // Ajustar las líneas de conexión después de renderizar
    setTimeout(() => this.adjustConnectorLines(), 100);
  }

  /**
   * Renderiza un nodo usando estructura UL/LI para mejor jerarquía
   * @param {Object} node - Nodo a renderizar
   * @param {number} level - Nivel jerárquico del nodo
   * @returns {HTMLElement} - Elemento LI que representa el nodo y sus hijos
   */
  renderNodeUL(node, level) {
    // Crear elemento LI para este nodo y sus hijos
    const hierarchyItem = document.createElement('li');
    hierarchyItem.className = 'hierarchy';

    // Determinar si el nodo está expandido
    const isExpanded = this.expandedNodes.get(node.id);

    // Marcar si está expandido o colapsado
    if (node.children && node.children.length > 0) {
      if (isExpanded) {
        hierarchyItem.classList.add('isOpen');
      } else {
        hierarchyItem.classList.add('isChildrenCollapsed');
      }

      // Añadir clase para nodos con muchos hijos
      if (node.children.length > 3) {
        hierarchyItem.classList.add('multi-children');
      }
    }

    // Crear el nodo en sí mismo
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'node';
    nodeDiv.id = node.id;
    nodeDiv.setAttribute('data-level', level);

    // Hacer que el nodo entero sea clicable para expandir/contraer
    if (node.children && node.children.length > 0) {
      nodeDiv.classList.add('clickable');
      nodeDiv.addEventListener('click', (e) => {
        // Si el clic fue en el botón de expandir/contraer, no hacemos nada
        // ya que ese evento será manejado por el listener del botón
        if (e.target.closest('.edge')) {
          return;
        }
        this.toggleNode(node.id);
      });
    }

    // Crear el contenido principal del nodo
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';

    // Figura para el avatar
    const figure = document.createElement('figure');
    figure.className = 'mb-1';

    // Si el nodo tiene imagen, mostrarla
    if (node.img) {
      // Crear avatar con SVG para soporte de imagen circular
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '80');
      svg.setAttribute('height', '80');
      svg.setAttribute('viewBox', '0 0 80 80');
      svg.style.display = 'block';

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      // Crear patrón para la imagen
      const patternId = `avatar-${node.id}`;
      const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      pattern.setAttribute('id', patternId);
      pattern.setAttribute('width', '100%');
      pattern.setAttribute('height', '100%');
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');

      const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', node.img);
      image.setAttribute('width', '80');
      image.setAttribute('height', '80');
      image.setAttribute('preserveAspectRatio', 'xMidYMid slice'); // Mantener proporción y centrar
      image.setAttribute('x', '0');
      image.setAttribute('y', '0');

      pattern.appendChild(image);

      // Crear rectángulo con el patrón
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', '80');
      rect.setAttribute('height', '80');
      rect.setAttribute('rx', '40'); // Radio para hacerlo circular (mitad del ancho)
      rect.setAttribute('style', `fill: url(#${patternId});`);

      g.appendChild(pattern);
      g.appendChild(rect);
      svg.appendChild(g);
      figure.appendChild(svg);
    } else {
      // Placeholder para avatar si no hay imagen
      const avatarPlaceholder = document.createElement('div');
      avatarPlaceholder.className = 'avatar-placeholder';
      avatarPlaceholder.textContent = node.name.substring(0, 2).toUpperCase();
      figure.appendChild(avatarPlaceholder);
    }

    contentDiv.appendChild(figure);

    // Nombre completo
    const namePara = document.createElement('p');
    namePara.className = 'c-name font-size-14 fw-600 mb-2';
    const nameSpan = document.createElement('span');
    nameSpan.title = node.name;
    nameSpan.textContent = node.name;
    namePara.appendChild(nameSpan);
    contentDiv.appendChild(namePara);

    // Cargo/título
    const jobPara = document.createElement('p');
    jobPara.className = 'c-job font-size-12 fw-900 text-basic-700 mb-1';
    const jobSpan = document.createElement('span');
    jobSpan.title = node.title || '';
    jobSpan.textContent = node.title || '';
    jobPara.appendChild(jobSpan);
    contentDiv.appendChild(jobPara);

    // Añadir información adicional si está disponible
    if (node.department) {
      const deptPara = document.createElement('p');
      deptPara.className = 'font-size-12 fw-500 text-basic-700 mb-0';
      const deptSpan = document.createElement('span');
      deptSpan.title = node.department;
      deptSpan.textContent = node.department;
      deptPara.appendChild(deptSpan);
      contentDiv.appendChild(deptPara);
    }

    // Botón de expansión/colapso si tiene hijos
    if (node.children && node.children.length > 0) {
      // Agregar botón para expandir/colapsar al lado derecho del nodo
      const edgeIcon = document.createElement('i');
      edgeIcon.className = 'edge verticalEdge rightEdge oci ' +
                          (isExpanded ? 'oci-minus' : 'oci-plus');
      // Configurar evento de clic
      edgeIcon.addEventListener('click', (e) => {
        e.stopPropagation(); // Evitar que el clic se propague al nodo
        this.toggleNode(node.id);
      });
      nodeDiv.appendChild(edgeIcon);
    }

    // Ensamblar el nodo completo
    nodeDiv.appendChild(contentDiv);
    hierarchyItem.appendChild(nodeDiv);

    // Renderizar hijos si hay y está expandido
    if (node.children && node.children.length > 0) {
      const childrenList = document.createElement('ul');
      childrenList.className = 'nodes';

      // Ocultar si está colapsado
      if (!isExpanded) {
        childrenList.classList.add('hidden');
      }

      // Renderizar cada hijo
      node.children.forEach((childNode, index) => {
        const childElement = this.renderNodeUL(childNode, level + 1);

        // Añadir clases especiales a los elementos extremos para mejor alineación
        if (index === 0) {
          childElement.classList.add('first-child-node');
        }
        if (index === node.children.length - 1) {
          childElement.classList.add('last-child-node');
        }

        childrenList.appendChild(childElement);
      });

      hierarchyItem.appendChild(childrenList);
    }

    return hierarchyItem;
  }

  /**
   * Alterna el estado de un nodo (expandido/colapsado)
   * @param {number|string} nodeId - ID del nodo a alternar
   */
  toggleNode(nodeId) {
    // Cambiar estado de expansión
    const currentState = this.expandedNodes.get(nodeId);
    this.expandedNodes.set(nodeId, !currentState);

    // Buscar el elemento del nodo en el DOM
    const nodeElement = document.querySelector(`[id="${nodeId}"]`);
    if (!nodeElement) return;

    // Buscar el elemento li padre
    const hierarchyElement = nodeElement.closest('.hierarchy');
    if (!hierarchyElement) return;

    // Buscar la lista de hijos
    const childrenList = hierarchyElement.querySelector('ul.nodes');
    if (!childrenList) return;

    // Cambiar el estado visual
    if (currentState) { // Estaba expandido, ahora colapsar
      hierarchyElement.classList.remove('isOpen');
      hierarchyElement.classList.add('isChildrenCollapsed');
      childrenList.classList.add('hidden');

      // Cambiar ícono del botón
      const edgeIcon = nodeElement.querySelector('.edge.rightEdge');
      if (edgeIcon) {
        edgeIcon.classList.remove('oci-minus');
        edgeIcon.classList.add('oci-plus');
      }

      // Eliminar la línea vertical del padre cuando se colapsa
      const parentVertLine = hierarchyElement.querySelector('.parent-connector');
      if (parentVertLine) {
        parentVertLine.remove(); // Eliminar completamente el elemento
      }
    } else { // Estaba colapsado, ahora expandir
      hierarchyElement.classList.add('isOpen');
      hierarchyElement.classList.remove('isChildrenCollapsed');
      childrenList.classList.remove('hidden');

      // Cambiar ícono del botón
      const edgeIcon = nodeElement.querySelector('.edge.rightEdge');
      if (edgeIcon) {
        edgeIcon.classList.remove('oci-plus');
        edgeIcon.classList.add('oci-minus');
      }
    }

    // Ya no llamamos a adjustPositions() que ajustaba el zoom
    // Solo nos aseguramos de que los cambios sean visibles
    setTimeout(() => {
      // Esperar a que el DOM se actualice para cualquier ajuste visual necesario
      this.ensureChartIsVisible();

      // Ajustar las líneas de conexión después de expandir/colapsar
      this.adjustConnectorLines();
    }, 300);
  }

  /**
   * Ajusta las posiciones de los nodos después de expandir/colapsar
   * @private - Ya no se usa directamente
   */
  adjustPositions() {
    // Esta función ya no se llama directamente
    setTimeout(() => {
      // Solo verificamos que el gráfico siga siendo visible
      this.ensureChartIsVisible();
    }, 300);
  }

  /**
   * Expande todos los nodos
   */
  expandAll() {
    // Expandir todos los nodos en el mapa de estado
    const expandNodes = (nodes) => {
      nodes.forEach(node => {
        this.expandedNodes.set(node.id, true);
        if (node.children && node.children.length) {
          expandNodes(node.children);
        }
      });
    };

    expandNodes(this.hierarchicalData);

    // Re-renderizar todo el organigrama
    this.render();

    // Ajustar las líneas después de un tiempo para que el DOM se actualice
    setTimeout(() => this.adjustConnectorLines(), 300);
  }

  /**
   * Colapsa todos los nodos excepto los niveles iniciales configurados
   */
  collapseAll() {
    const collapseNodes = (nodes, level) => {
      nodes.forEach(node => {
        this.expandedNodes.set(node.id, level < this.options.initialVisibleLevels);
        if (node.children && node.children.length) {
          collapseNodes(node.children, level + 1);
        }
      });
    };

    collapseNodes(this.hierarchicalData, 0);

    // Re-renderizar todo el organigrama
    this.render();

    // Ajustar las líneas después de un tiempo para que el DOM se actualice
    setTimeout(() => this.adjustConnectorLines(), 300);
  }

  /**
   * Crea los controles de navegación del organigrama
   */
  createControls() {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'org-controls';
    // Posicionar en la parte inferior derecha
    controlsContainer.style.position = 'absolute';
    controlsContainer.style.bottom = '10px';
    controlsContainer.style.right = '10px';
    controlsContainer.style.zIndex = '100';

    // Controles de zoom
    const zoomControls = document.createElement('div');
    zoomControls.className = 'org-zoom-controls';

    // Botón zoom out
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.innerHTML = '−';
    zoomOutBtn.title = 'Reducir';
    zoomOutBtn.className = 'org-zoom-out';
    zoomOutBtn.addEventListener('click', () => this.adjustZoom(-0.1));

    // Botón zoom in
    const zoomInBtn = document.createElement('button');
    zoomInBtn.innerHTML = '+';
    zoomInBtn.title = 'Ampliar';
    zoomInBtn.className = 'org-zoom-in';
    zoomInBtn.addEventListener('click', () => this.adjustZoom(0.1));

    // Botón reset
    const resetBtn = document.createElement('button');
    resetBtn.innerHTML = '↺';
    resetBtn.title = 'Restablecer vista';
    resetBtn.className = 'org-reset';
    resetBtn.addEventListener('click', () => this.resetView());

    // Botón expandir todo
    const expandAllBtn = document.createElement('button');
    expandAllBtn.innerHTML = '⊞';
    expandAllBtn.title = 'Expandir todo';
    expandAllBtn.className = 'org-expand-all';
    expandAllBtn.addEventListener('click', () => this.expandAll());

    // Botón colapsar todo
    const collapseAllBtn = document.createElement('button');
    collapseAllBtn.innerHTML = '⊟';
    collapseAllBtn.title = 'Colapsar todo';
    collapseAllBtn.className = 'org-collapse-all';
    collapseAllBtn.addEventListener('click', () => this.collapseAll());

    // Añadir botones al contenedor
    zoomControls.appendChild(zoomOutBtn);
    zoomControls.appendChild(resetBtn);
    zoomControls.appendChild(zoomInBtn);
    zoomControls.appendChild(expandAllBtn);
    zoomControls.appendChild(collapseAllBtn);

    // Añadir controles al contenedor principal
    controlsContainer.appendChild(zoomControls);
    this.container.appendChild(controlsContainer);
  }

  /**
   * Crea controles de ordenamiento
   * @returns {HTMLElement} - Contenedor con controles de ordenamiento
   * @private - Ya no se utiliza externamente
   */
  _createSortControls() {
    // Mantener el código original por si se necesita en el futuro,
    // pero cambiar el nombre a privado (_) ya que no lo usamos
    // ...existing code...
  }

  /**
   * Configura el zoom y arrastre del organigrama
   */
  setupZoomControls() {
    // Inicializar variables para seguimiento de estado
    this.scale = this.options.initialZoom;
    this.translateX = 0;
    this.translateY = 0;
    let isDragging = false;
    let lastX, lastY;

    // Función para aplicar transformación
    const applyTransform = () => {
      this.chartContainer.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    };

    // Inicializar la transformación
    applyTransform();

    // ===== MANEJO DE EVENTOS DE MOUSE =====

    // Mantener referencia al contexto para usar en los event listeners
    const self = this;

    // Función para iniciar arrastre
    const startDrag = function(e) {
      // Evitar si es botón derecho o clic en elementos interactivos
      if (e.button === 2 ||
          e.target.tagName === 'BUTTON' ||
          e.target.closest('.org-toggle-btn, button, select')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Guardar posición inicial
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;

      // Cambiar cursor
      document.body.style.cursor = 'grabbing';
      self.chartContainer.classList.add('dragging');
    };

    // Función para manejar arrastre
    const moveDrag = function(e) {
      if (!isDragging) return;

      e.preventDefault();
      e.stopPropagation();

      // Calcular el desplazamiento desde la última posición
      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;

      // Actualizar posición
      self.translateX += deltaX;
      self.translateY += deltaY;

      // Guardar la nueva posición como última conocida
      lastX = e.clientX;
      lastY = e.clientY;

      // Aplicar transformación
      applyTransform();
    };

    // Función para finalizar arrastre
    const endDrag = function() {
      if (!isDragging) return;

      isDragging = false;
      document.body.style.cursor = '';
      self.chartContainer.classList.remove('dragging');
    };

    // Registrar eventos de mouse
    this.chartContainer.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('mouseleave', endDrag);

    // ===== MANEJO DE EVENTOS TÁCTILES =====

    // Función para iniciar arrastre táctil
    const startTouchDrag = function(e) {
      if (e.touches.length !== 1 ||
          e.target.tagName === 'BUTTON' ||
          e.target.closest('.org-toggle-btn, button, select')) {
        return;
      }

      e.preventDefault();

      // Guardar posición inicial
      isDragging = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;

      self.chartContainer.classList.add('dragging');
    };

    // Función para manejar arrastre táctil
    const moveTouchDrag = function(e) {
      if (!isDragging || e.touches.length !== 1) return;

      e.preventDefault();

      // Calcular el desplazamiento
      const deltaX = e.touches[0].clientX - lastX;
      const deltaY = e.touches[0].clientY - lastY;

      // Actualizar posición
      self.translateX += deltaX;
      self.translateY += deltaY;

      // Guardar la nueva posición
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;

      // Aplicar transformación
      applyTransform();
    };

    // Función para finalizar arrastre táctil
    const endTouchDrag = function() {
      if (!isDragging) return;

      isDragging = false;
      self.chartContainer.classList.remove('dragging');
    };

    // Registrar eventos táctiles
    this.chartContainer.addEventListener('touchstart', startTouchDrag, { passive: false });
    window.addEventListener('touchmove', moveTouchDrag, { passive: false });
    window.addEventListener('touchend', endTouchDrag);
    window.addEventListener('touchcancel', endTouchDrag);

    // ===== MANEJO DE ZOOM CON RUEDA DEL RATÓN =====

    // Función para manejar zoom con la rueda
    const handleWheel = function(e) {
      e.preventDefault();

      // Determinar dirección del zoom
      const delta = e.deltaY > 0 ? -0.1 : 0.1;

      // Obtener posición del ratón relativa al contenedor
      const rect = self.chartContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calcular posición del ratón en el espacio del chart (sin escalar)
      const mouseChartX = (mouseX - self.translateX) / self.scale;
      const mouseChartY = (mouseY - self.translateY) / self.scale;

      // Calcular nueva escala con límites
      const newScale = Math.max(0.1, Math.min(3, self.scale + delta));

      // Actualizar escala
      self.scale = newScale;

      // Ajustar translación para mantener el punto bajo el cursor
      self.translateX = mouseX - mouseChartX * newScale;
      self.translateY = mouseY - mouseChartY * newScale;

      // Aplicar transformación
      applyTransform();
    };

    // Registrar evento de rueda
    this.container.addEventListener('wheel', handleWheel, { passive: false });

    // Añadir tabIndex para que el contenedor pueda recibir foco
    this.chartContainer.tabIndex = 0;

    // Centrar el organigrama inicialmente después de un breve retraso
    // para asegurar que todos los elementos se han renderizado
    setTimeout(() => this.centerChart(), 100);
  }

  /**
   * Centra el organigrama en el contenedor
   */
  centerChart() {
    if (!this.chartContainer || !this.container) return;
    // Usar setTimeout para permitir que el DOM se actualice
    setTimeout(() => {
      // Obtener dimensiones
      const containerRect = this.container.getBoundingClientRect();
      const organigramaElem = this.chartContainer.querySelector('.organigrama');

      if (!organigramaElem) return;

      const organigramaRect = organigramaElem.getBoundingClientRect();

      // Calcular el centro
      let newTranslateX = (containerRect.width - organigramaRect.width * this.scale) / 2;
      // Establecer un margen mínimo
      if (newTranslateX < 20) newTranslateX = 20;

      // Siempre mantener un margen superior
      const newTranslateY = 20;

      // Actualizar posición
      this.translateX = newTranslateX;
      this.translateY = newTranslateY;

      // Aplicar transformación
      this.chartContainer.style.transform =
        `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }, 50);
  }

  /**
   * Función ayudante para garantizar que el gráfico sea visible
   */
  ensureChartIsVisible() {
    // Similar a centerChart pero garantiza que al menos parte del gráfico sea visible
    if (!this.chartContainer || !this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const organigramaElem = this.chartContainer.querySelector('.organigrama');

    if (!organigramaElem) return;

    const actualRect = organigramaElem.getBoundingClientRect();

    // Si está completamente fuera de la vista, centrarlo
    if (actualRect.right < 0 || actualRect.left > containerRect.width ||
        actualRect.bottom < 0 || actualRect.top > containerRect.height) {
      this.centerChart();
    }
  }

  /**
   * Ajusta el nivel de zoom
   * @param {number} delta - Cambio en el nivel de zoom
   */
  adjustZoom(delta) {
    if (!this.chartContainer) return;

    // Obtener dimensiones
    const containerRect = this.container.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;

    // Calcular posición del centro en el espacio del chart sin escalar
    const centerChartX = (centerX - this.translateX) / this.scale;
    const centerChartY = (centerY - this.translateY) / this.scale;

    // Calcular nueva escala
    const newScale = Math.max(0.1, Math.min(3, this.scale + delta));

    // Actualizar escala
    this.scale = newScale;

    // Ajustar translación para mantener el punto central
    this.translateX = centerX - centerChartX * newScale;
    this.translateY = centerY - centerChartY * newScale;

    // Aplicar transformación
    this.chartContainer.style.transform =
      `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
  }

  /**
   * Restablece la vista al estado inicial
   */
  resetView() {
    this.scale = this.options.initialZoom;
    this.translateX = 0;
    this.translateY = 0;

    // Aplicar transformación inicial
    this.chartContainer.style.transform =
      `translate(0, 0) scale(${this.options.initialZoom})`;

    // Centrar el organigrama
    this.centerChart();
  }

  /**
   * Ajusta automáticamente el nivel de zoom para mostrar todo el organigrama
   * con un margen razonable
   */
  autoAdjustZoom() {
    if (!this.chartContainer || !this.container) return;

    // Obtener dimensiones del contenedor
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Obtener dimensiones del organigrama
    const organigramaElem = this.chartContainer.querySelector('.organigrama');
    if (!organigramaElem) return;
    const organigramaRect = organigramaElem.getBoundingClientRect();

    // Calcular el tamaño real sin escala
    const realWidth = organigramaRect.width / this.scale;
    const realHeight = organigramaRect.height / this.scale;

    // Calcular ratios de zoom necesarios para ajustar horizontal y verticalmente
    const horizontalZoom = (containerWidth - 40) / realWidth; // 40px de margen
    const verticalZoom = (containerHeight - 40) / realHeight; // 40px de margen

    // Usar el zoom más restrictivo (el menor) para asegurar que todo sea visible
    let newZoom = Math.min(horizontalZoom, verticalZoom);

    // Limitar el zoom a un rango razonable
    newZoom = Math.max(0.2, Math.min(newZoom, 1.5));

    // Aplicar el nuevo zoom solo si es significativamente diferente al actual
    if (Math.abs(newZoom - this.scale) > 0.05) {
      // Calcular centro del organigrama
      const orgCenterX = (organigramaRect.left + organigramaRect.right) / 2;
      const orgCenterY = (organigramaRect.top + organigramaRect.bottom) / 2;

      // Calcular centro del contenedor
      const containerCenterX = containerRect.left + containerWidth / 2;
      const containerCenterY = containerRect.top + containerHeight / 2;

      // Calcular desplazamiento necesario para centrar
      const deltaX = containerCenterX - orgCenterX;
      const deltaY = containerCenterY - orgCenterY;

      // Actualizar escala y posición
      this.scale = newZoom;

      // Calcular nueva traducción para centrar el contenido
      this.translateX = deltaX + (this.translateX * newZoom / this.scale);
      this.translateY = deltaY + (this.translateY * newZoom / this.scale);

      // Aplicar la transformación
      this.chartContainer.style.transform =
        `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }
  }

  /**
   * Actualiza el organigrama con nuevos datos
   * @param {Object} newData - Nuevos datos para el organigrama
   * @param {Object} [options] - Opciones adicionales
   */
  update(newData, options = null) {
    if (options) {
      this.options = { ...this.options, ...options };
    }

    this.data = newData;
    this.hierarchicalData = null;
    this.expandedNodes = new Map();
    this.initialize();

    // Ajustar zoom automáticamente para mostrar todo el contenido
    setTimeout(() => this.autoAdjustZoom(), 100);
  }

  /**
   * Ajusta las líneas de conexión para que se extiendan exactamente entre los nodos
   */
  adjustConnectorLines() {
    // Seleccionar todos los nodos que tengan hijos
    const multiChildParents = Array.from(document.querySelectorAll('.organigrama .hierarchy.isOpen'));

    multiChildParents.forEach(parentItem => {
      const childrenList = parentItem.querySelector('ul.nodes');
      if (!childrenList) return;

      const children = Array.from(childrenList.querySelectorAll(':scope > li'));
      if (children.length < 2) return;

      const firstChild = children[0];
      const lastChild = children[children.length - 1];

      // Dar un poco más de tiempo a los nuevos nodos para renderizarse completamente
      setTimeout(() => {
        // Usar getBoundingClientRect para posiciones absolutas correctas
        const firstNodeDiv = firstChild.querySelector('.node');
        const lastNodeDiv = lastChild.querySelector('.node');

        if (!firstNodeDiv || !lastNodeDiv) return;

        // Obtener rectángulos para mediciones precisas
        const firstRect = firstNodeDiv.getBoundingClientRect();
        const lastRect = lastNodeDiv.getBoundingClientRect();

        // Calcular centros para medición precisa
        const firstCenterX = firstRect.left + firstRect.width / 2;
        const lastCenterX = lastRect.left + lastRect.width / 2;

        // La distancia es desde el centro del primer al centro del último nodo
        const distance = lastCenterX - firstCenterX;

        // Punto de inicio es relativo al contenedor padre
        const parentRect = childrenList.getBoundingClientRect();
        const startPos = firstCenterX - parentRect.left;

        // Crear un elemento DIV real para la línea
        let connector = childrenList.querySelector('.connector-line');
        if (!connector) {
          connector = document.createElement('div');
          connector.className = 'connector-line';
          childrenList.prepend(connector);
        }

        // Estilo directo en el elemento con mejor posicionamiento
        Object.assign(connector.style, {
          position: 'absolute',
          height: '2px',
          backgroundColor: '#4ade80',
          width: `${Math.max(20, distance)}px`, // Asegurar un ancho mínimo
          top: '-20px',
          left: `${startPos}px`, // Posición basada en el centro del primer nodo
          zIndex: '1'
        });

        // También crear líneas verticales cortas para cada nodo hijo
        children.forEach(child => {
          const nodeDiv = child.querySelector('.node');
          let vertLine = child.querySelector('.vert-connector');
          if (!vertLine) {
            vertLine = document.createElement('div');
            vertLine.className = 'vert-connector';
            child.prepend(vertLine);
          }

          Object.assign(vertLine.style, {
            position: 'absolute',
            width: '2px',
            backgroundColor: '#4ade80',
            height: '20px',
            top: '-20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '1'
          });
        });

        // También asegurar la línea vertical del nodo padre
        if (parentItem.classList.contains('isOpen')) {
          // Eliminar cualquier conector vertical existente para evitar duplicados
          const existingParentVertLine = parentItem.querySelector(':scope > .parent-connector');
          if (existingParentVertLine) {
            existingParentVertLine.remove();
          }

          // Crear nuevo conector vertical solo si el nodo está expandido
          const parentVertLine = document.createElement('div');
          parentVertLine.className = 'parent-connector';
          parentItem.appendChild(parentVertLine);

          const nodeDiv = parentItem.querySelector('.node');
          Object.assign(parentVertLine.style, {
            position: 'absolute',
            width: '2px',
            backgroundColor: '#4ade80',
            height: '10px',
            top: `${nodeDiv.offsetHeight}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '1'
          });
        }

        // Remover estilos previos que pueden estar interfiriendo
        const oldStyles = document.querySelectorAll(`style[data-for="${parentItem.querySelector('.node').id}"]`);
        oldStyles.forEach(style => style.remove());
      }, 50); // Pequeño retraso para asegurar mediciones correctas
    });

    // Asegurar que no queden líneas verticales en nodos colapsados
    const collapsedNodes = Array.from(document.querySelectorAll('.organigrama .hierarchy:not(.isOpen)'));
    collapsedNodes.forEach(node => {
      const parentVertLine = node.querySelector('.parent-connector');
      if (parentVertLine) {
        parentVertLine.remove();
      }
    });
  }
}

// Exportar la clase
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HTMLOrgChart;
} else {
  window.HTMLOrgChart = HTMLOrgChart;
}
