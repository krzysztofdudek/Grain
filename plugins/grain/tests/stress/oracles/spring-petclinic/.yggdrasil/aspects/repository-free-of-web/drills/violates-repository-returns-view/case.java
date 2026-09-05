package org.springframework.samples.petclinic.owner;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.web.servlet.ModelAndView;

public interface OwnerRepository extends JpaRepository<Owner, Integer> {

	ModelAndView findOwnerView(Integer id);

}
