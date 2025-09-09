import React from "react";
import { AppBar, Toolbar, Box, Typography, Container, MenuItem } from "@mui/material";
import { NavLink } from "react-router-dom";
import MenuItemLink from "../shared/components/MenuItemLink";


export default function NavBar() {
  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" 
        sx={{ backgroundImage: 'linear-gradient(135deg,#182a73 0%, #218aae 69%, #20a7ac 89%)' }}>
        <Container maxWidth={false}>
          <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            {/* Centered site header - Home link */}
            <MenuItem component={NavLink} to='/' sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Box component="img" 
                   src="/images/temporal_logo_animation.gif" 
                   alt="Temporal Logo" 
                   sx={{ 
                     width: 60, 
                     height: 60,
                     filter: 'brightness(0) invert(1)'
                   }} />
              <Typography variant="h5" fontWeight='bold'>
                Temporal Priority/Fairness Task Queue Demo
              </Typography>
            </MenuItem>

          </Toolbar>
        </Container>
      </AppBar>
    </Box>

  )
}
