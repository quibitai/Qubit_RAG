module.exports = (file) => file.replace(/import { useState, useEffect } from 'react';/g, "import { useState, useEffect, useMemo } from 'react';");
