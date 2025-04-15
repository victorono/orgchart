/**
 * HTMLOrgChart.js - Biblioteca ligera para generar organigramas con HTML y CSS
 * Implementación con estructura UL/LI para mejor jerarquía y conexiones basadas en CSS
 */
class HTMLOrgChart {
  constructor(config) {
    // Constantes para los tiempos de timeout (en milisegundos)
    this.TIMEOUTS = {
      INITIAL_CENTER: 300,       // Tiempo para centrar inicialmente
      CENTER_VERIFICATION: 500,  // Verificación adicional de centrado
      CONNECTOR_REDRAW: 50,      // Tiempo para redibujar conectores
      NODE_TOGGLE_UPDATE: 300,   // Tiempo para actualizar DOM después de expandir/colapsar
      WHEEL_ZOOM_DEBOUNCE: 100,  // Debounce para zoom con rueda
      RENDER_CONNECTORS: 100,    // Tiempo para renderizar conectores iniciales
      FULLSCREEN_ADJUST: 100,    // Tiempo para ajuste después de pantalla completa
      AUTO_ZOOM_ADJUST: 100      // Tiempo para ajuste automático de zoom
    };

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
      initialZoom: 0.8,
      minHeight: '300px', // Altura mínima predeterminada
      fullscreenBgColor: '#fff',
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

    // Configurar observador de redimensionamiento si está disponible
    this.setupResizeObserver();

    // Asegurar que el organigrama esté centrado inicialmente
    // con un retraso apropiado para permitir que el DOM se renderice completamente
    setTimeout(() => {
      this.forceCenterWithScale(this.options.initialZoom);

      // Verificación adicional después de un tiempo mayor
      setTimeout(() => {
        this.forceCenterWithScale(this.options.initialZoom);
      }, this.TIMEOUTS.CENTER_VERIFICATION);
    }, this.TIMEOUTS.INITIAL_CENTER);
  }

  /**
   * Fuerza el centrado del organigrama con una escala específica
   * @param {number} scale - La escala a aplicar
   */
  forceCenterWithScale(scale) {
    if (!this.chartContainer || !this.container) return;

    // Asegurar que la escala sea válida
    if (isNaN(scale) || scale <= 0) {
      scale = 1; // Valor por defecto si la escala es inválida
    }

    // Establecer la escala actual
    this.scale = scale;

    // Obtener dimensiones del contenedor
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Para obtener medidas precisas, quitar temporalmente cualquier transformación
    const originalTransform = this.chartContainer.style.transform;
    this.chartContainer.style.transform = '';

    // Obtener el organigrama y sus dimensiones reales
    const orgChart = this.chartContainer.querySelector('.organigrama');
    if (!orgChart) {
      this.chartContainer.style.transform = originalTransform;
      return;
    }

    // Usar getBoundingClientRect para dimensiones exactas
    const orgRect = orgChart.getBoundingClientRect();
    const orgWidth = orgRect.width;
    const orgHeight = orgRect.height;

    // Calcular la posición central exacta
    const newTranslateX = Math.max(0, (containerWidth - (orgWidth * scale)) / 2);
    const newTranslateY = Math.max(0, (containerHeight - (orgHeight * scale)) / 2);

    // Actualizar la posición
    this.translateX = 0;
    this.translateY = 0;

    // Aplicar transformación con la posición central exacta y la escala
    this.chartContainer.style.transform = `scale(${scale})`;

    // Impedir que el usuario pueda arrastrar el organigrama fuera de los límites visibles
    this.setupBoundaries();

    // Redibujar los conectores después del centrado
    setTimeout(() => this.redrawAllConnectors(), this.TIMEOUTS.CONNECTOR_REDRAW);
  }

  /**
   * Detectar cuando el contenedor cambia de tamaño para recentrar
   * Este método se llama automáticamente si hay un ResizeObserver disponible
   */
  setupResizeObserver() {
    if (typeof ResizeObserver !== 'undefined') {
      // Crear un observador de redimensionamiento para el contenedor
      this.resizeObserver = new ResizeObserver(entries => {
        // Solo nos interesa nuestro contenedor
        const entry = entries.find(e => e.target === this.container);
        if (entry) {
          // Manejar el cambio de tamaño
          this.handleResize();
        }
      });

      // Comenzar a observar el contenedor
      this.resizeObserver.observe(this.container);
    }

    // Escuchar también el evento de redimensionamiento de la ventana
    window.addEventListener('resize', () => this.handleResize());
  }

  /**
   * Centra el organigrama con un nivel de zoom específico
   * @param {number} zoomLevel - Nivel de zoom a aplicar
   */
  centerChartWithZoom(zoomLevel) {
    if (!this.chartContainer || !this.container) return;

    // Verificar valores inválidos
    if (isNaN(zoomLevel) || zoomLevel <= 0) {
      // console.warn("Zoom inválido en centerChartWithZoom:", zoomLevel);
      zoomLevel = this.options.initialZoom;
    }

    // Actualizar escala
    this.scale = zoomLevel;

    // Asegurar que los conectores se mantengan visibles
    this.redrawAllConnectors();
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

    // Aplicar estilo para mantener el contenido dentro de los límites
    this.container.style.overflow = 'hidden';
    this.container.style.position = 'relative';

    // Aplicar altura mínima si está establecida
    if (this.options.minHeight) {
      this.container.style.minHeight = typeof this.options.minHeight === 'number'
        ? `${this.options.minHeight}px`
        : this.options.minHeight;
    }

    // Crear contenedor principal del organigrama con capacidad de zoom y arrastre
    const chartContainer = document.createElement('div');
    chartContainer.className = 'org-chart-container';

    // Asegurar que el contenedor del organigrama ocupe todo el espacio disponible
    chartContainer.style.width = '100%';
    chartContainer.style.height = '100%';
    chartContainer.style.position = 'absolute';

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
    setTimeout(() => this.redrawAllConnectors(), this.TIMEOUTS.RENDER_CONNECTORS);
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

      // Manejar error 404 para imágenes no encontradas
      image.addEventListener('error', () => {
        // Eliminar la imagen con error
        pattern.removeChild(image);

        // Reemplazar con un placeholder de texto
        const fallbackGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // Fondo circular en color de relleno
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '40');
        circle.setAttribute('cy', '40');
        circle.setAttribute('r', '40');
        circle.setAttribute('fill', this.options.nodeColor || '#4ade80');

        // Texto con iniciales - mejorado para centrado perfecto
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '40');
        text.setAttribute('y', '40');  // Centrar en 40 en vez de 48
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('alignment-baseline', 'central'); // Mejor propiedad para centrado vertical
        text.setAttribute('dominant-baseline', 'central'); // Compatibilidad con más navegadores
        text.setAttribute('fill', 'white');
        text.setAttribute('font-size', '28');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('font-family', 'Arial, sans-serif'); // Asegurar consistencia tipográfica
        text.textContent = node.name.substring(0, 2).toUpperCase();

        fallbackGroup.appendChild(circle);
        fallbackGroup.appendChild(text);
        pattern.appendChild(fallbackGroup);
      });

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
    const isExpanding = !currentState; // true si está expandiendo, false si está contrayendo
    this.expandedNodes.set(nodeId, isExpanding);

    // Buscar el elemento del nodo en el DOM
    const nodeElement = document.querySelector(`[id="${nodeId}"]`);
    if (!nodeElement) return;

    // Buscar el elemento li padre
    const hierarchyElement = nodeElement.closest('.hierarchy');
    if (!hierarchyElement) return;

    // Buscar la lista de hijos
    const childrenList = hierarchyElement.querySelector('ul.nodes');
    if (!childrenList) return;

    // Guardar el tamaño del organigrama antes de cambiar el estado
    const organigramaElem = this.chartContainer.querySelector('.organigrama');
    const orgSizeBefore = organigramaElem ?
      { width: organigramaElem.offsetWidth, height: organigramaElem.offsetHeight } :
      null;

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

    // Esperar a que el DOM se actualice completamente
    setTimeout(() => {
      // Redibujamos todos los conectores
      this.redrawAllConnectors();

      // Al contraer nodos:
      // - No recalcular posición para evitar movimientos bruscos
      // - No hacer centrado automático para evitar saltos
      if (isExpanding) {
        // Si estamos expandiendo, puede ser necesario reposicionar
        // para mostrar el nuevo contenido
        if (orgSizeBefore && organigramaElem) {
          const orgSizeAfter = {
            width: organigramaElem.offsetWidth,
            height: organigramaElem.offsetHeight
          };

          // Solo si el tamaño cambió significativamente, ajustamos la vista
          if (orgSizeAfter.width > orgSizeBefore.width * 1.3 ||
              orgSizeAfter.height > orgSizeBefore.height * 1.3) {
            this.ensureChartIsVisible();
          }
        }
      }
    }, this.TIMEOUTS.NODE_TOGGLE_UPDATE);
  }

  /**
   * Función ayudante para garantizar que el gráfico sea visible
   * Modificada para ser menos intrusiva cuando se contrae un nodo
   */
  ensureChartIsVisible() {
    if (!this.chartContainer || !this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const organigramaElem = this.chartContainer.querySelector('.organigrama');
    if (!organigramaElem) return;

    const actualRect = organigramaElem.getBoundingClientRect();

    // Si está completamente fuera de la vista o muy cerca del borde, ajustar
    // pero con un enfoque menos agresivo que simplemente centrar
    if (actualRect.right < 0 || actualRect.left > containerRect.width ||
        actualRect.bottom < 0 || actualRect.top > containerRect.height) {

      // En lugar de centrar completamente, solo ajustar lo necesario para
      // que al menos una parte significativa sea visible
      let newTranslateX = this.translateX;
      let newTranslateY = this.translateY;

      // Ajustar horizontalmente si es necesario
      if (actualRect.right < 50) { // Casi invisible a la izquierda
        newTranslateX += (50 - actualRect.right);
      } else if (actualRect.left > containerRect.width - 50) { // Casi invisible a la derecha
        newTranslateX -= (actualRect.left - (containerRect.width - 50));
      }

      // Ajustar verticalmente si es necesario
      if (actualRect.bottom < 50) { // Casi invisible arriba
        newTranslateY += (50 - actualRect.bottom);
      } else if (actualRect.top > containerRect.height - 50) { // Casi invisible abajo
        newTranslateY -= (actualRect.top - (containerRect.height - 50));
      }

      // Aplicar los ajustes solo si realmente cambiaron
      if (newTranslateX !== this.translateX || newTranslateY !== this.translateY) {
        this.translateX = newTranslateX;
        this.translateY = newTranslateY;
        this.chartContainer.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
      }
    }
  }

  /**
   * Crea los controles de navegación del organigrama
   */
  createControls() {
    // Controles inferiores (zoom)
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'org-controls';
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

    // Añadir botones al contenedor
    zoomControls.appendChild(zoomOutBtn);
    zoomControls.appendChild(resetBtn);
    zoomControls.appendChild(zoomInBtn);

    // Añadir controles al contenedor principal
    controlsContainer.appendChild(zoomControls);
    this.container.appendChild(controlsContainer);

    // Crear botón de pantalla completa (esquina superior izquierda)
    this._createFullscreenButton();
  }

  /**
   * Crea el botón de pantalla completa
   * @private
   */
  _createFullscreenButton() {
    // Crear contenedor para el botón de pantalla completa
    const fullscreenContainer = document.createElement('div');
    fullscreenContainer.className = 'org-fullscreen-control';
    fullscreenContainer.style.position = 'absolute';
    fullscreenContainer.style.top = '10px';
    fullscreenContainer.style.right = '10px';
    fullscreenContainer.style.zIndex = '100';

    // Crear botón de pantalla completa
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.title = 'Pantalla completa';
    fullscreenBtn.className = 'org-fullscreen-btn';
    fullscreenBtn.innerHTML = '⛶'; // Símbolo de pantalla completa
    fullscreenBtn.style.backgroundColor = '#fff';
    fullscreenBtn.style.border = '1px solid #ccc';
    fullscreenBtn.style.borderRadius = '3px';
    fullscreenBtn.style.padding = '5px 8px';
    fullscreenBtn.style.cursor = 'pointer';
    fullscreenBtn.style.fontSize = '16px';

    // Variable para rastrear el estado de pantalla completa
    let isFullscreen = false;

    // Guardar las dimensiones originales
    const originalStyle = {
      width: this.container.style.width,
      height: this.container.style.height,
      margin: this.container.style.margin,
      position: this.container.style.position,
      top: this.container.style.top,
      left: this.container.style.left,
      zIndex: this.container.style.zIndex
    };

    // Función para alternar el modo de pantalla completa
    const toggleFullscreen = () => {
      if (!isFullscreen) {
        // Guardar posición actual de desplazamiento
        this._scrollPosition = {
          x: window.scrollX,
          y: window.scrollY
        };

        // Cambiar a pantalla completa
        Object.assign(this.container.style, {
          position: 'fixed',
          width: '100%',
          height: '100%',
          top: '0',
          left: '0',
          margin: '0',
          zIndex: '9999',
          backgroundColor: this.options.fullscreenBgColor || '#fff',
          overflow: 'hidden'
        });

        // Prevenir desplazamiento
        document.body.style.overflow = 'hidden';

        // Cambiar icono del botón
        fullscreenBtn.innerHTML = '⮌'; // Símbolo de salir de pantalla completa
        fullscreenBtn.title = 'Salir de pantalla completa';

        // Recentrar el organigrama en el nuevo contenedor
        setTimeout(() => this.forceCenterWithScale(this.scale), this.TIMEOUTS.FULLSCREEN_ADJUST);

        isFullscreen = true;
      } else {
        // Restaurar dimensiones originales
        Object.assign(this.container.style, originalStyle);

        // Restaurar desplazamiento
        document.body.style.overflow = '';

        // Restaurar posición de desplazamiento
        if (this._scrollPosition) {
          window.scrollTo(this._scrollPosition.x, this._scrollPosition.y);
        }

        // Cambiar icono del botón
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = 'Pantalla completa';

        // Recentrar el organigrama en el contenedor original
        setTimeout(() => this.forceCenterWithScale(this.scale), this.TIMEOUTS.FULLSCREEN_ADJUST);

        isFullscreen = false;
      }

      // Manejar redimensionamiento
      this.handleResize();
    };

    // Añadir evento de clic
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Añadir evento de teclado para salir con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    });

    // Añadir botón al contenedor
    fullscreenContainer.appendChild(fullscreenBtn);
    this.container.appendChild(fullscreenContainer);
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

      // Calcular nueva posición
      let newTranslateX = self.translateX + deltaX;
      let newTranslateY = self.translateY + deltaY;

      // Aplicar restricción para mantener el organigrama visible
      // Evitar arrastrar demasiado hacia la izquierda o derecha
      if (self.boundaries) {
        const minX = -self.boundaries.orgWidth + 100;  // Permitir que se oculte parcialmente, pero no totalmente
        const maxX = self.boundaries.containerWidth - 100;  // Mantener al menos una parte visible
        newTranslateX = Math.min(maxX, Math.max(minX, newTranslateX));

        const minY = -self.boundaries.orgHeight + 100;  // Permitir que se oculte parcialmente, pero no totalmente
        const maxY = self.boundaries.containerHeight - 100;  // Mantener al menos una parte visible
        newTranslateY = Math.min(maxY, Math.max(minY, newTranslateY));
      }

      // Actualizar posición
      self.translateX = newTranslateX;
      self.translateY = newTranslateY;

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

      // Actualizar posición considerando la escala actual
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

      // Recalcular las líneas de conexión después de aplicar zoom
      // Usar debounce para mejorar rendimiento
      clearTimeout(self.wheelZoomTimeout);
      self.wheelZoomTimeout = setTimeout(() => {
        self.redrawAllConnectors();
      }, self.TIMEOUTS.WHEEL_ZOOM_DEBOUNCE);
    };

    // Registrar evento de rueda
    this.container.addEventListener('wheel', handleWheel, { passive: false });

    // Añadir tabIndex para que el contenedor pueda recibir foco
    this.chartContainer.tabIndex = 0;

    // Ya no usamos el setTimeout aquí, porque ahora llamamos a centerChartWithZoom
    // desde initialize() con un retraso más largo para asegurar que todo esté listo
  }

  /**
   * Centra el organigrama en el contenedor
   */
  centerChart() {
    this.forceCenterWithScale(this.scale);
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
      this.forceCenterWithScale(this.scale);
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

    // Recalcular las líneas de conexión
    setTimeout(() => this.redrawAllConnectors(), 100); // Usar redrawAllConnectors
  }

  /**
   * Restablece la vista al estado inicial
   */
  resetView() {
    // Forzar el centrado con la escala inicial
    this.forceCenterWithScale(this.options.initialZoom);

    // No es necesario redibujado adicional aquí ya que forceCenterWithScale ya lo hace
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
    setTimeout(() => this.autoAdjustZoom(), this.TIMEOUTS.AUTO_ZOOM_ADJUST);
  }
/**
 * Redibuja todos los conectores del organigrama teniendo en cuenta la escala
 */
redrawAllConnectors() {
  try {
    // 1. Eliminar todos los conectores existentes para empezar limpio
    document.querySelectorAll('.connector-line, .vert-connector, .parent-connector').forEach(conn => {
      conn.remove();
    });

    // 2. Procesar todos los nodos con hijos expuestos
    const allExpandedParents = Array.from(document.querySelectorAll('.organigrama .hierarchy.isOpen'));

    allExpandedParents.forEach(parentNode => {
      // Crear conector vertical para el padre
      this._createParentConnector(parentNode);

      // Obtener lista de hijos
      const childrenList = parentNode.querySelector('ul.nodes');
      if (!childrenList || childrenList.classList.contains('hidden')) return;

      const children = Array.from(childrenList.querySelectorAll(':scope > li'));

      // Crear conectores verticales para cada hijo
      children.forEach(childNode => {
        this._createChildConnector(childNode);
      });

      // Si hay múltiples hijos, crear conector horizontal
      if (children.length >= 2) {
        this._createHorizontalConnector(childrenList, children);
      }
    });

    // 3. Crear conectores verticales para los demás nodos hijos que necesiten conectores
    // Pero ahora con la verificación mejorada en _createChildConnector, solo se crearán
    // donde sean necesarios
    const allChildNodes = Array.from(document.querySelectorAll('.organigrama ul.nodes > li'));
    allChildNodes.forEach(node => {
      if (!node.querySelector('.vert-connector')) {
        this._createChildConnector(node);
      }
    });

  } catch (error) {
    console.error("Error en redrawAllConnectors:", error);
  }
}

/**
 * Crea un conector vertical para un nodo hijo
 * @param {HTMLElement} childNode - Nodo hijo
 * @private
 */
_createChildConnector(childNode) {
  try {
    const nodeDiv = childNode.querySelector('.node');
    if (!nodeDiv) return;

    // Verificar si este nodo realmente necesita un conector vertical
    // Un nodo no necesita conector si está en una lista sin un nodo padre visible
    const parentList = childNode.closest('ul.nodes');
    if (!parentList) return;

    // Si el nodo padre no está expandido o no existe, no mostrar el conector vertical
    const parentHierarchy = parentList.closest('.hierarchy');
    const isParentVisible = parentHierarchy &&
                            !parentHierarchy.classList.contains('hidden') &&
                            parentHierarchy.classList.contains('isOpen');

    // Para nodos raíz o cuando el padre no es visible, no mostrar el conector
    if (!parentHierarchy || !isParentVisible) {
      // Si el nodo pertenece a la lista de nodos raíz, no crear el conector
      const isRootNode = parentList.parentElement ===
                         this.chartContainer.querySelector('.organigrama');
      if (isRootNode) return;
    }

    const childConnector = document.createElement('div');
    childConnector.className = 'vert-connector';

    // Aplicar estilos con CSS en lugar de cálculos en JS
    Object.assign(childConnector.style, {
      position: 'absolute',
      width: '2px',
      backgroundColor: this.options.lineColor,
      height: '20px',
      top: '-20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '1'
    });

    childNode.prepend(childConnector);
  } catch (error) {
    console.error("Error creando conector del hijo:", error);
  }
}

/**
 * Crea un conector vertical para un nodo padre
 * @param {HTMLElement} parentNode - Nodo padre expandido
 * @private
 */
_createParentConnector(parentNode) {
  try {
    if (!parentNode || !parentNode.classList.contains('isOpen')) return;

    const nodeDiv = parentNode.querySelector('.node');
    if (!nodeDiv) return;

    const parentConnector = document.createElement('div');
    parentConnector.className = 'parent-connector';

    // Aplicar estilos específicos usando CSS para mayor consistencia
    Object.assign(parentConnector.style, {
      position: 'absolute',
      width: '2px',
      backgroundColor: this.options.lineColor,
      height: '10px',
      top: `${nodeDiv.offsetHeight}px`,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '1'
    });

    parentNode.appendChild(parentConnector);
} catch (error) {
    console.error("Error creando conector del padre:", error);
  }
}

/**
 * Crea un conector horizontal entre nodos hermanos
 * @param {HTMLElement} childrenList - Lista contenedor de los hijos
 * @param {Array} children - Array de nodos hijo
 * @private
 */
_createHorizontalConnector(childrenList, children) {
  try {
    if (children.length < 2) return;

    // En lugar de usar getBoundingClientRect(), usamos offsetLeft y offsetWidth
    // que no se ven afectados por la escala
    const firstChild = children[0];
    const lastChild = children[children.length - 1];

    // Obtener los nodos para calcular posiciones
    const firstNodeDiv = firstChild.querySelector('.node');
    const lastNodeDiv = lastChild.querySelector('.node');

    if (!firstNodeDiv || !lastNodeDiv) return;

    // Calcular centros en el espacio sin escala
    const firstChildLeft = firstChild.offsetLeft;
    const lastChildLeft = lastChild.offsetLeft;
    const firstChildWidth = firstChild.offsetWidth;
    const lastChildWidth = lastChild.offsetWidth;

    const firstCenter = firstChildLeft + (firstChildWidth / 2);
    const lastCenter = lastChildLeft + (lastChildWidth / 2);

    // Crear el conector horizontal
    const connector = document.createElement('div');
    connector.className = 'connector-line';

    // Calcular posición y ancho
    const startPos = Math.min(firstCenter, lastCenter);
    const endPos = Math.max(firstCenter, lastCenter);
    const width = endPos - startPos;

    // Aplicar estilos con posiciones absolutas
    Object.assign(connector.style, {
      position: 'absolute',
      height: '2px',
      backgroundColor: this.options.lineColor,
      width: `${width}px`,
      top: '-20px',
      left: `${startPos}px`,
      zIndex: '1'
    });

    childrenList.prepend(connector);
  } catch (error) {
    console.error("Error creando conector horizontal:", error);
  }
}

/**
 * Configura los límites para que el organigrama no pueda ser arrastrado fuera de la vista
 */
setupBoundaries() {
  // Guardamos las dimensiones para validaciones durante el arrastre
  if (!this.chartContainer || !this.container) return;

  const containerRect = this.container.getBoundingClientRect();
  const orgChart = this.chartContainer.querySelector('.organigrama');
  if (!orgChart) return;

  // Guardar dimensiones para uso posterior durante el arrastre
  this.boundaries = {
    containerWidth: containerRect.width,
    containerHeight: containerRect.height,
    orgWidth: orgChart.getBoundingClientRect().width * this.scale,
    orgHeight: orgChart.getBoundingClientRect().height * this.scale
  };
}

/**
 * Maneja eventos de redimensionamiento de ventana
 */
handleResize() {
  // Recalcular límites
  this.setupBoundaries();

  // Centrar con escala actual
  this.forceCenterWithScale(this.scale);
}
}

// Exportar la clase
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HTMLOrgChart;
} else {
  window.HTMLOrgChart = HTMLOrgChart;
}
