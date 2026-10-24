# Portfolio Tracker

Web estática para seguir tu portafolio: depósitos, retiros, compras, ventas y cobros (dividendos/renta).

- Precio promedio de compra (PPC) ponderado, resultado realizado y no realizado, peso por posición
- Caja, capital depositado, retorno sobre depósitos
- Gráfico de evolución (valor de mercado, capital depositado, costo invertido)
- Datos guardados solo en tu navegador (localStorage); Exportar/Importar JSON para backup

Los precios se piden a Yahoo Finance vía proxy CORS; si falla, se cargan a mano en la tabla de posiciones.
